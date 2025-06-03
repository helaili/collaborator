import * as core from '@actions/core'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'
import { parseCollaboratorsFile } from './collaborator.js'
import { CollaboratorManager } from './collaboratorManager.js'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // Get inputs and initialize dependencies
    const { filename, octokit, repoInfo } = getInputsAndDependencies()

    // Validate and load collaborators file
    const filePath = resolveFilePath(filename)
    const desiredCollaborators = await loadCollaboratorsFile(filePath)

    // Create collaborator manager and sync collaborators
    const manager = new CollaboratorManager(octokit, repoInfo)
    await manager.syncCollaborators(desiredCollaborators)

    core.info('Repository collaborators have been successfully synchronized')
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

/**
 * Get inputs and initialize necessary dependencies
 */
function getInputsAndDependencies() {
  const filename: string = core.getInput('filename')
  const token: string = core.getInput('token')

  // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
  core.debug(`Input filename: ${filename}`)

  // Initialize octokit
  const octokit = github.getOctokit(token)
  const context = github.context
  const repoInfo = context.repo

  core.info(`Repository: ${repoInfo.owner}/${repoInfo.repo}`)

  return { filename, octokit, repoInfo }
}

/**
 * Resolve the file path for the collaborators file
 */
export function resolveFilePath(filename: string): string {
  const filePath = path.isAbsolute(filename)
    ? filename
    : path.join(process.cwd(), filename)

  if (!fs.existsSync(filePath)) {
    throw new Error(`Collaborator file not found: ${filePath}`)
  }

  return filePath
}

/**
 * Load and parse the collaborators file
 */
export async function loadCollaboratorsFile(filePath: string) {
  const desiredCollaborators = await parseCollaboratorsFile(filePath)
  core.info(`Found ${desiredCollaborators.length} collaborators in file`)
  return desiredCollaborators
}
