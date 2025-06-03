/**
 * Unit tests for CollaboratorManager class
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)

// Dynamic import after mocking to ensure the module uses our mocks
const { CollaboratorManager } = await import('../src/collaboratorManager.js')
const { CollaboratorObject } = await import('../src/types.js')

interface RepositoryInfo {
  owner: string
  repo: string
}

describe('CollaboratorManager', () => {
  let collaboratorManager: InstanceType<typeof CollaboratorManager>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockOctokit: any
  const mockRepoInfo: RepositoryInfo = {
    owner: 'testowner',
    repo: 'testrepo'
  }

  beforeEach(() => {
    // Create fresh mocks for each test
    mockOctokit = {
      rest: {
        repos: {
          listCollaborators: jest.fn(),
          listInvitations: jest.fn(),
          addCollaborator: jest.fn(),
          removeCollaborator: jest.fn(),
          deleteInvitation: jest.fn()
        }
      }
    }

    collaboratorManager = new CollaboratorManager(mockOctokit, mockRepoInfo)
  })

  afterEach(() => {
    jest.resetAllMocks()
    // Clear the core mock calls
    jest.clearAllMocks()
  })

  describe('syncCollaborators', () => {
    it('should add new collaborators', async () => {
      const desiredCollaborators = [
        new CollaboratorObject('newuser', 'push'),
        new CollaboratorObject('anotheruser', 'admin')
      ]

      // Mock empty current state
      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({ data: [] })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledTimes(2)
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'newuser',
        role: 'push'
      })
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'anotheruser',
        role: 'admin'
      })
    })

    it('should remove collaborators not in desired list', async () => {
      const desiredCollaborators = [new CollaboratorObject('keepuser', 'push')]

      // Mock current collaborators
      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({
        data: [
          {
            login: 'keepuser',
            role_name: 'push'
          },
          {
            login: 'removeuser',
            role_name: 'admin'
          }
        ]
      })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({ data: [] })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.removeCollaborator).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.repos.removeCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'removeuser'
      })
    })

    it('should update collaborator roles when they differ', async () => {
      const desiredCollaborators = [
        new CollaboratorObject('updateuser', 'admin')
      ]

      // Mock existing collaborator with different role
      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({
        data: [
          {
            login: 'updateuser',
            role_name: 'push'
          }
        ]
      })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({ data: [] })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledTimes(1)
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'updateuser',
        role: 'admin'
      })
    })

    it('should not update collaborator when role is already correct', async () => {
      const desiredCollaborators = [
        new CollaboratorObject('correctuser', 'push')
      ]

      // Mock existing collaborator with correct role
      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({
        data: [
          {
            login: 'correctuser',
            role_name: 'push'
          }
        ]
      })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({ data: [] })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.addCollaborator).not.toHaveBeenCalled()
      expect(mockOctokit.rest.repos.removeCollaborator).not.toHaveBeenCalled()
    })

    it('should handle pending invitations with correct role', async () => {
      const desiredCollaborators = [
        new CollaboratorObject('pendinguser', 'push')
      ]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({
        data: [
          {
            id: 123,
            invitee: { login: 'pendinguser' },
            permissions: 'push'
          }
        ]
      })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.deleteInvitation).not.toHaveBeenCalled()
      expect(mockOctokit.rest.repos.addCollaborator).not.toHaveBeenCalled()
    })

    it('should handle case-insensitive username matching', async () => {
      const desiredCollaborators = [new CollaboratorObject('UserName', 'push')]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({
        data: [
          {
            login: 'username',
            role_name: 'push'
          }
        ]
      })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({ data: [] })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      // Should not add or remove since usernames match (case-insensitive)
      expect(mockOctokit.rest.repos.addCollaborator).not.toHaveBeenCalled()
      expect(mockOctokit.rest.repos.removeCollaborator).not.toHaveBeenCalled()
    })

    it('should handle complex scenario with adds, updates, and removes', async () => {
      const desiredCollaborators = [
        new CollaboratorObject('keepuser', 'push'),
        new CollaboratorObject('updateuser', 'admin'),
        new CollaboratorObject('newuser', 'pull')
      ]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({
        data: [
          {
            login: 'keepuser',
            role_name: 'push'
          },
          {
            login: 'updateuser',
            role_name: 'push'
          },
          {
            login: 'removeuser',
            role_name: 'admin'
          }
        ]
      })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({
        data: [
          {
            id: 456,
            invitee: { login: 'removeinvite' },
            permissions: 'push'
          }
        ]
      })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      // Should add new user
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'newuser',
        role: 'pull'
      })

      // Should update existing user
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'updateuser',
        role: 'admin'
      })

      // Should remove unwanted collaborator
      expect(mockOctokit.rest.repos.removeCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'removeuser'
      })

      // Should remove unwanted invitation
      expect(mockOctokit.rest.repos.deleteInvitation).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        invitation_id: 456
      })
    })

    it('should update pending invitations with incorrect role', async () => {
      const desiredCollaborators = [
        new CollaboratorObject('pendinguser', 'admin')
      ]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({
        data: [
          {
            id: 123,
            invitee: { login: 'pendinguser' },
            permissions: 'push'
          }
        ]
      })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.deleteInvitation).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        invitation_id: 123
      })
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'pendinguser',
        role: 'admin'
      })
    })

    it('should remove pending invitations not in desired list', async () => {
      const desiredCollaborators = [new CollaboratorObject('keepuser', 'push')]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({
        data: [
          {
            id: 123,
            invitee: { login: 'removeuser' },
            permissions: 'push'
          }
        ]
      })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      expect(mockOctokit.rest.repos.deleteInvitation).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        invitation_id: 123
      })
    })

    it('should handle invitations without invitee', async () => {
      const desiredCollaborators = [new CollaboratorObject('newuser', 'push')]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.listInvitations.mockResolvedValue({
        data: [
          {
            id: 123,
            invitee: null, // No invitee
            permissions: 'push'
          }
        ]
      })

      await collaboratorManager.syncCollaborators(desiredCollaborators)

      // Should add the new user and not crash on null invitee
      expect(mockOctokit.rest.repos.addCollaborator).toHaveBeenCalledWith({
        owner: 'testowner',
        repo: 'testrepo',
        username: 'newuser',
        role: 'push'
      })
    })
  })

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const desiredCollaborators = [new CollaboratorObject('newuser', 'push')]

      mockOctokit.rest.repos.listCollaborators.mockRejectedValue(
        new Error('API Error')
      )

      await expect(
        collaboratorManager.syncCollaborators(desiredCollaborators)
      ).rejects.toThrow('API Error')
    })

    it('should handle invitation API errors', async () => {
      const desiredCollaborators = [new CollaboratorObject('newuser', 'push')]

      mockOctokit.rest.repos.listCollaborators.mockResolvedValue({ data: [] })
      mockOctokit.rest.repos.listInvitations.mockRejectedValue(
        new Error('Invitation API Error')
      )

      await expect(
        collaboratorManager.syncCollaborators(desiredCollaborators)
      ).rejects.toThrow('Invitation API Error')
    })
  })
})
