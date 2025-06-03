import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types'
import { Octokit } from '@octokit/rest'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const octokit = new Octokit()

type Defined<T> = T extends undefined ? never : T
type ArrayElement<ArrayType extends readonly unknown[]> = ArrayType[number]

export interface Collaborator {
  username: string
  role: string
}

/**
 * Represents a collaborator in the repository
 */
export class CollaboratorObject implements Collaborator {
  username: string
  role: string

  constructor(username: string, role: string) {
    this.username = username
    this.role = role ? role.toLowerCase() : 'push'
  }
}

export interface RepositoryInfo {
  owner: string
  repo: string
}

export interface RepositoryPermissions {
  admin: boolean
  maintain?: boolean
  push: boolean
  triage?: boolean
  pull: boolean
}

export type RepoCollaboratorList = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.listCollaborators
>

export type RepoCollaborator = ArrayElement<Defined<RepoCollaboratorList>>

export type RepoInvitationList = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.repos.listInvitations
>

export type RepoInvitation = ArrayElement<Defined<RepoInvitationList>>
