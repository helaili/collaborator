/**
 * Unit tests for the action's main functionality, src/main.ts
 *
 * To mock dependencies in ESM, you can create fixtures that export mock
 * functions and objects. For example, the core module is mocked in this test,
 * so that the actual '@actions/core' module is not imported.
 */
import { jest } from '@jest/globals'
import * as core from '../__fixtures__/core.js'
import { parseCollaboratorsFile } from '../src/collaborator'
import * as fs from 'fs'

// Mocks should be declared before the module being tested is imported.
jest.unstable_mockModule('@actions/core', () => core)

describe('parseCollaboratorsFile', () => {
  const mockReadFile = jest.spyOn(fs.promises, 'readFile')
  //const mockYamlParse = jest.spyOn(yaml, 'parse')

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('parses team format YAML', async () => {
    const yamlContent = `
- team: devs
  role: admin
  members:
    - username: alice
    - username: bob
- team: qa
  role: pull
  members:
    - username: carol
`
    mockReadFile.mockResolvedValue(yamlContent)
    const result = await parseCollaboratorsFile('fake/path.yaml')
    expect(result).toEqual([
      { username: 'alice', role: 'admin' },
      { username: 'bob', role: 'admin' },
      { username: 'carol', role: 'pull' }
    ])
  })

  it('parses array of usernames (string array)', async () => {
    const yamlContent = `
- alice
- bob
`
    mockReadFile.mockResolvedValue(yamlContent)
    const result = await parseCollaboratorsFile('fake/path.yaml')
    expect(result).toEqual([
      { username: 'alice', role: 'push' },
      { username: 'bob', role: 'push' }
    ])
  })

  it('parses array of objects with username and role', async () => {
    const yamlContent = `
- username: alice
  role: admin
- username: bob
  role: pull
`
    mockReadFile.mockResolvedValue(yamlContent)
    const result = await parseCollaboratorsFile('fake/path.yaml')
    expect(result).toEqual([
      { username: 'alice', role: 'admin' },
      { username: 'bob', role: 'pull' }
    ])
  })

  it('parses object format with usernames as keys', async () => {
    const yamlContent = `
alice: admin
bob: pull
`
    mockReadFile.mockResolvedValue(yamlContent)
    const result = await parseCollaboratorsFile('fake/path.yaml')
    expect(result).toEqual([
      { username: 'alice', role: 'admin' },
      { username: 'bob', role: 'pull' }
    ])
  })

  it('defaults role to push if not specified', async () => {
    const yamlContent = `
- username: alice
- username: bob
`
    mockReadFile.mockResolvedValue(yamlContent)
    const result = await parseCollaboratorsFile('fake/path.yaml')
    expect(result).toEqual([
      { username: 'alice', role: 'push' },
      { username: 'bob', role: 'push' }
    ])
  })

  it('throws error on invalid format', async () => {
    const yamlContent = `invalid: [1,2,3]`
    mockReadFile.mockResolvedValue(yamlContent)
    await expect(parseCollaboratorsFile('fake/path.yaml')).rejects.toThrow(
      /Unable to parse collaborators file format/
    )
  })

  it('throws error if readFile fails', async () => {
    mockReadFile.mockRejectedValue(new Error('File not found'))
    await expect(parseCollaboratorsFile('fake/path.yaml')).rejects.toThrow(
      /Failed to parse collaborator file: File not found/
    )
  })
})
