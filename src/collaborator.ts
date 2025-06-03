import { promises as fsPromises } from 'fs'
import * as yaml from 'yaml'
import { Collaborator, CollaboratorObject } from './types.js'

/**
 * Represents a team member in the repository
 */
export interface TeamMember {
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
export interface Team {
  team: string
  role: string
  members: TeamMember[]
}

/**
 * Parse collaborators from a file
 * @param filePath The path to the collaborator file
 * @returns Array of collaborators
 */

export async function parseCollaboratorsFile(
  filePath: string
): Promise<Collaborator[]> {
  try {
    const fileContent = await fsPromises.readFile(filePath, 'utf8')
    const collaborators: Collaborator[] = []

    // Parse YAML
    const parsed = yaml.parse(fileContent)

    if (Array.isArray(parsed)) {
      // Check if it's the team format
      if (
        parsed.length > 0 &&
        parsed[0] !== null &&
        typeof parsed[0] === 'object' &&
        'team' in parsed[0] &&
        'members' in parsed[0]
      ) {
        for (const team of parsed as Team[]) {
          for (const member of team.members) {
            collaborators.push(
              new CollaboratorObject(member.username, team.role)
            )
          }
        }
        return collaborators
      }

      // Standard array format
      return parsed.map((collab) => {
        if (typeof collab === 'string') {
          // If it's just a string, use default role (push)
          return new CollaboratorObject(collab, 'push')
        } else if (collab !== null && typeof collab === 'object') {
          return new CollaboratorObject(collab.username, collab.role)
        } else {
          throw new Error(`Invalid collaborator format: ${collab}`)
        }
      })
    } else if (parsed && typeof parsed === 'object') {
      // Handle object format with usernames as keys
      try {
        // Validate that each entry contains valid role values
        const entries = Object.entries(parsed)
        for (const [, value] of entries) {
          // Check if value is a string or can be converted to a valid role
          if (!(typeof value === 'string' || value === null)) {
            throw new Error('Invalid role format')
          }
        }

        return entries.map(
          ([username, role]) => new CollaboratorObject(username, String(role))
        )
      } catch {
        throw new Error('Unable to parse collaborators file format')
      }
    }

    throw new Error('Unable to parse collaborators file format')
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse collaborator file: ${error.message}`)
    }
    throw error
  }
}
