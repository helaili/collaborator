# Using the Team-Based Format

This GitHub Action supports a team-based format for organizing your repository
collaborators. This format makes it easier to manage permissions at a team
level, while storing additional information about team members.

## Format Structure

```yaml
- team: [Team Name]
  role: [Role]
  members:
    - username: [GitHub Username]
      name: [Full Name] # Optional
      email: [Email] # Optional
      title: [Job Title] # Optional
      location: [Location] # Optional
      timezone: [Timezone] # Optional
```

## Role Mapping

Roles are mapped to GitHub permissions as follows:

- `admin` → `admin` permission (full repository access)
- `member` → `push` permission (read-write access)
- `pull` → `pull` permission (read-only access)
- `push` → `push` permission (read-write access)
- `maintain` → `maintain` permission
- `triage` → `triage` permission
- Any other role → defaults to `push` permission (with a warning)

## Example

```yaml
- team: Engineering
  role: admin
  members:
    - username: engineer1
      name: Alice Engineer
      email: alice@example.com
      title: Senior Engineer
      location: San Francisco
      timezone: PST
    - username: engineer2
      name: Bob Builder
      email: bob@example.com
      title: DevOps Engineer
      location: New York
      timezone: EST
- team: Marketing
  role: push
  members:
    - username: marketer1
      name: Carol Marketer
      email: carol@example.com
      title: Marketing Manager
      location: London
      timezone: GMT
- team: External
  role: pull
  members:
    - username: consultant1
      name: David Consultant
      email: david@consultancy.com
```

In this example:

- All Engineering team members will receive admin permissions
- All Marketing team members will receive push (read-write) permissions
- All External team members will receive pull (read-only) permissions

## Benefits of the Team Format

1. **Organizational structure**: Group collaborators by team or department
2. **Bulk permission management**: Change permissions for an entire team at once
3. **Additional metadata**: Store additional information about collaborators
4. **Documentation**: Provide context about each collaborator's role

## Notes

- The action only uses the `username` and resulting `permission` for GitHub
  operations
- The additional fields (name, email, title, etc.) are for documentation
  purposes only
- You can have as many teams as needed with different permission levels
