import {
  Collaborator,
  RepoCollaborator,
  RepoCollaboratorList,
  RepoInvitation,
  RepoInvitationList,
  RepositoryInfo
} from './types.js'
import * as core from '@actions/core'
import { getOctokit } from '@actions/github'

/**
 * Manages repository collaborators
 */
export class CollaboratorManager {
  private octokit: ReturnType<typeof getOctokit>
  private repoInfo: RepositoryInfo
  private affiliation: 'outside' | 'direct' | 'all'

  constructor(
    octokit: ReturnType<typeof getOctokit>,
    repoInfo: RepositoryInfo,
    affiliation: 'outside' | 'direct' | 'all'
  ) {
    this.octokit = octokit
    this.repoInfo = repoInfo
    this.affiliation = affiliation
  }

  /**
   * Synchronize repository collaborators with the desired list
   */
  async syncCollaborators(desiredCollaborators: Collaborator[]): Promise<void> {
    const { currentCollaborators, pendingInvites } =
      await this.getCurrentState()

    const desiredUsernames = this.getDesiredUsernames(desiredCollaborators)

    await this.processCollaboratorsToAddOrUpdate(
      desiredCollaborators,
      currentCollaborators,
      pendingInvites
    )
    await this.processCollaboratorsToRemove(
      currentCollaborators,
      desiredUsernames
    )
    await this.processInvitesToRemove(pendingInvites, desiredUsernames)
  }

  /**
   * Get current collaborators and pending invitations
   */
  private async getCurrentState(): Promise<{
    currentCollaborators: RepoCollaboratorList
    pendingInvites: RepoInvitationList
  }> {
    const { owner, repo } = this.repoInfo

    // Get current collaborators
    // Get all current collaborators, handling pagination
    const currentCollaborators: RepoCollaboratorList = []
    for await (const response of this.octokit.paginate.iterator(
      this.octokit.rest.repos.listCollaborators,
      {
        owner,
        repo,
        affiliation: this.affiliation,
        per_page: 100
      }
    )) {
      currentCollaborators.push(...response.data)
    }
    core.info(
      `Found ${currentCollaborators.length} current collaborators in repository`
    )

    // Get pending invites
    const { data: pendingInvites } =
      await this.octokit.rest.repos.listInvitations({
        owner,
        repo
      })
    core.info(`Found ${pendingInvites.length} pending invitations`)

    return { currentCollaborators, pendingInvites }
  }

  /**
   * Extract lowercase usernames from collaborators list
   */
  private getDesiredUsernames(collaborators: Collaborator[]): string[] {
    return collaborators.map((c) => {
      if (!c.username) {
        throw new Error(
          `Collaborator entry is missing username: ${JSON.stringify(c)}`
        )
      } else if (!(typeof c.username === 'string')) {
        throw new Error(
          `Collaborator username must be a string, got: ${JSON.stringify(c)}`
        )
      } else {
        return c.username.toLowerCase()
      }
    })
  }

  /**
   * Process collaborators that need to be added or have roles updated
   */
  private async processCollaboratorsToAddOrUpdate(
    desiredCollaborators: Collaborator[],
    currentCollaborators: RepoCollaboratorList,
    pendingInvites: RepoInvitationList
  ): Promise<void> {
    const { owner, repo } = this.repoInfo

    for (const collaborator of desiredCollaborators) {
      const username = collaborator.username.toLowerCase()
      const role = collaborator.role

      // Check if already a collaborator with correct role
      const existingCollaborator = currentCollaborators.find(
        (c) => c.login.toLowerCase() === username
      )

      if (existingCollaborator) {
        await this.handleExistingCollaborator(
          existingCollaborator,
          collaborator,
          role
        )
        continue
      }

      // Check if there's a pending invite
      const pendingInvite = pendingInvites.find(
        (invite) =>
          invite.invitee && invite.invitee.login.toLowerCase() === username
      )

      if (pendingInvite) {
        await this.handlePendingInvite(pendingInvite, collaborator, role)
        continue
      }

      // Add new collaborator
      core.info(
        `Adding collaborator ${collaborator.username} with ${role} role`
      )
      await this.octokit.rest.repos.addCollaborator({
        owner,
        repo,
        username: collaborator.username,
        permission: role
      })
    }
  }

  /**
   * Handle existing collaborator - check and update roles if needed
   */
  private async handleExistingCollaborator(
    existingCollaborator: RepoCollaborator,
    collaborator: Collaborator,
    role: string
  ): Promise<void> {
    const { owner, repo } = this.repoInfo
    const currentRole = existingCollaborator.role_name

    if (currentRole !== role) {
      core.info(
        `Updating role for ${collaborator.username} from ${currentRole} to ${role}`
      )
      await this.octokit.rest.repos.addCollaborator({
        owner,
        repo,
        username: collaborator.username,
        permission: role
      })
    } else {
      core.info(
        `Collaborator ${collaborator.username} already exists with correct role`
      )
    }
  }

  /**
   * Handle pending invitation - update if roles changed
   */
  private async handlePendingInvite(
    pendingInvite: RepoInvitation,
    collaborator: Collaborator,
    role: string
  ): Promise<void> {
    const { owner, repo } = this.repoInfo

    // Check if we need to update the role
    if (pendingInvite.permissions !== role) {
      // Delete the invite and send a new one
      core.info(
        `Updating invitation for ${collaborator.username}. Role changed from '${pendingInvite.permissions}' to '${role}'`
      )
      await this.octokit.rest.repos.deleteInvitation({
        owner,
        repo,
        invitation_id: pendingInvite.id
      })

      await this.octokit.rest.repos.addCollaborator({
        owner,
        repo,
        username: collaborator.username,
        permission: role
      })
    } else {
      core.info(`Invitation already pending for ${collaborator.username}`)
    }
  }

  /**
   * Process collaborators that need to be removed
   */
  private async processCollaboratorsToRemove(
    currentCollaborators: RepoCollaboratorList,
    desiredUsernames: string[]
  ): Promise<void> {
    const { owner, repo } = this.repoInfo

    for (const collaborator of currentCollaborators) {
      const username = collaborator.login.toLowerCase()

      // Skip if the collaborator should remain
      if (desiredUsernames.includes(username)) {
        continue
      }

      core.info(`Removing collaborator ${collaborator.login}`)
      await this.octokit.rest.repos.removeCollaborator({
        owner,
        repo,
        username: collaborator.login
      })
    }
  }

  /**
   * Process pending invites that need to be removed
   */
  private async processInvitesToRemove(
    pendingInvites: RepoInvitationList,
    desiredUsernames: string[]
  ): Promise<void> {
    const { owner, repo } = this.repoInfo

    for (const invite of pendingInvites) {
      if (!invite.invitee) continue

      const username = invite.invitee.login.toLowerCase()

      // Skip if the invite should remain
      if (desiredUsernames.includes(username)) {
        continue
      }

      core.info(`Removing invitation for ${invite.invitee.login}`)
      await this.octokit.rest.repos.deleteInvitation({
        owner,
        repo,
        invitation_id: invite.id
      })
    }
  }
}
