import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as yaml from 'yaml'
import { promises as fsPromises } from 'fs'
import * as path from 'path'

/**
 * Represents a team member in the repository
 */
interface TeamMember {
  username: string
  name?: string
  email?: string
  title?: string
  location?: string
  timezone?: string
}

/**
 * Represents a team in the repository
 */
interface Team {
  team: string
  role: 'admin' | 'member' | 'pull' | 'push' | 'maintain' | 'triage'
  members: TeamMember[]
}

/**
 * Represents a collaborator in the repository
 */
interface Collaborator {
  username: string
  permission: 'pull' | 'push' | 'admin' | 'maintain' | 'triage'
}

/**
 * Represents repository permissions
 */
interface RepositoryPermissions {
  admin?: boolean
  maintain?: boolean
  push?: boolean
  triage?: boolean
  pull?: boolean
}

/**
 * Maps team role to GitHub permission
 * @param role Team role
 * @returns GitHub permission level
 */
function mapRoleToPermission(
  role: string
): 'pull' | 'push' | 'admin' | 'maintain' | 'triage' {
  // Map team role to GitHub permission level
  switch (role.toLowerCase()) {
    case 'admin':
      return 'admin'
    case 'member':
      return 'push'
    case 'pull':
    case 'push':
    case 'maintain':
    case 'triage':
      return role.toLowerCase() as 'pull' | 'push' | 'maintain' | 'triage'
    default:
      core.warning(`Unknown role: ${role}, defaulting to 'push'`)
      return 'push'
  }
}

/**
 * Parse collaborators from a file
 * @param filePath The path to the collaborator file
 * @returns Array of collaborators
 */
async function parseCollaboratorsFile(
  filePath: string
): Promise<Collaborator[]> {
  try {
    const fileContent = await fsPromises.readFile(filePath, 'utf8')
    const collaborators: Collaborator[] = []

    // Parse YAML
    const parsed = yaml.parse(fileContent)

    if (Array.isArray(parsed)) {
      // Check if it's the team format
      if (parsed.length > 0 && 'team' in parsed[0] && 'members' in parsed[0]) {
        // Process team format
        for (const team of parsed as Team[]) {
          const permission = mapRoleToPermission(team.role)

          for (const member of team.members) {
            collaborators.push({
              username: member.username,
              permission
            })
          }
        }
        return collaborators
      }

      // Standard array format
      return parsed.map((collab) => {
        if (typeof collab === 'string') {
          // If it's just a string, use default permission (push)
          return { username: collab, permission: 'push' }
        } else {
          return {
            username: collab.username,
            permission: collab.permission || 'push'
          }
        }
      })
    } else if (parsed && typeof parsed === 'object') {
      // Handle object format with usernames as keys
      return Object.entries(parsed).map(([username, permission]) => ({
        username,
        permission: (typeof permission === 'string' ? permission : 'push') as
          | 'pull'
          | 'push'
          | 'admin'
          | 'maintain'
          | 'triage'
      }))
    }

    throw new Error('Unable to parse collaborators file format')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse collaborator file: ${error.message}`)
    }
    throw error
  }
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Input parameters
    const filename: string = core.getInput('filename')
    const token: string = core.getInput('token')

    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Input filename: ${filename}`)

    // Initialize octokit
    const octokit = github.getOctokit(token)
    const context = github.context
    const { owner, repo } = context.repo

    core.info(`Repository: ${owner}/${repo}`)

    // Check if file exists
    const filePath = path.isAbsolute(filename)
      ? filename
      : path.join(process.cwd(), filename)

    if (!fs.existsSync(filePath)) {
      throw new Error(`Collaborator file not found: ${filePath}`)
    }

    // Read and parse the collaborators file
    const desiredCollaborators = await parseCollaboratorsFile(filePath)
    core.info(`Found ${desiredCollaborators.length} collaborators in file`)

    // Get current collaborators
    const { data: currentCollaborators } =
      await octokit.rest.repos.listCollaborators({
        owner,
        repo,
        affiliation: 'all'
      })

    core.info(
      `Found ${currentCollaborators.length} current collaborators in repository`
    )

    // Get pending invites
    const { data: pendingInvites } = await octokit.rest.repos.listInvitations({
      owner,
      repo
    })

    core.info(`Found ${pendingInvites.length} pending invitations`)

    // Extract usernames to process
    const desiredUsernames = desiredCollaborators.map((c) =>
      c.username.toLowerCase()
    )

    // Process collaborators to add
    for (const collaborator of desiredCollaborators) {
      const username = collaborator.username.toLowerCase()
      const permission = collaborator.permission

      // Skip if already a collaborator with correct permission
      const existingCollaborator = currentCollaborators.find(
        (c) => c.login.toLowerCase() === username
      )

      if (existingCollaborator) {
        // Use the permission information from the existing collaborator data
        const currentPermission =
          existingCollaborator.permissions || ({} as RepositoryPermissions)
        const currentRole = currentPermission.admin
          ? 'admin'
          : currentPermission.maintain
            ? 'maintain'
            : currentPermission.push
              ? 'push'
              : currentPermission.triage
                ? 'triage'
                : 'pull'

        if (currentRole !== permission) {
          core.info(
            `Updating permission for ${collaborator.username} from ${currentRole} to ${permission}`
          )
          await octokit.rest.repos.addCollaborator({
            owner,
            repo,
            username: collaborator.username,
            permission
          })
        } else {
          core.info(
            `Collaborator ${collaborator.username} already exists with correct permission`
          )
        }
        continue
      }

      // Check if there's a pending invite
      const pendingInvite = pendingInvites.find(
        (invite) =>
          invite.invitee && invite.invitee.login.toLowerCase() === username
      )

      if (pendingInvite) {
        // Check if we need to update the permission
        if (pendingInvite.permissions !== permission) {
          // Delete the invite and send a new one
          core.info(`Updating invitation for ${collaborator.username}`)
          await octokit.rest.repos.deleteInvitation({
            owner,
            repo,
            invitation_id: pendingInvite.id
          })

          await octokit.rest.repos.addCollaborator({
            owner,
            repo,
            username: collaborator.username,
            permission
          })
        } else {
          core.info(`Invitation already pending for ${collaborator.username}`)
        }
        continue
      }

      // Add new collaborator
      core.info(
        `Adding collaborator ${collaborator.username} with ${permission} permission`
      )
      await octokit.rest.repos.addCollaborator({
        owner,
        repo,
        username: collaborator.username,
        permission
      })
    }

    // Process collaborators to remove
    for (const collaborator of currentCollaborators) {
      const username = collaborator.login.toLowerCase()

      // Skip if the collaborator should remain
      if (desiredUsernames.includes(username)) {
        continue
      }

      core.info(`Removing collaborator ${collaborator.login}`)
      await octokit.rest.repos.removeCollaborator({
        owner,
        repo,
        username: collaborator.login
      })
    }

    // Process invites to remove
    for (const invite of pendingInvites) {
      if (!invite.invitee) continue

      const username = invite.invitee.login.toLowerCase()

      // Skip if the invite should remain
      if (desiredUsernames.includes(username)) {
        continue
      }

      core.info(`Removing invitation for ${invite.invitee.login}`)
      await octokit.rest.repos.deleteInvitation({
        owner,
        repo,
        invitation_id: invite.id
      })
    }

    core.info('Repository collaborators have been successfully synchronized')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
