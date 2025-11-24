#!/bin/bash

# Bump version and push tag script
# Usage: ./scripts/bump-version.sh [patch|minor|major]

set -e

# Default to patch if no argument provided
BUMP_TYPE=${1:-patch}

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Error: Invalid bump type. Use 'patch', 'minor', or 'major'"
  exit 1
fi

# Get current version from package.json
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Use npm version to bump (this updates package.json and package-lock.json)
echo "Bumping $BUMP_TYPE version..."
NEW_VERSION=$(npm version $BUMP_TYPE --no-git-tag-version)

# Remove the 'v' prefix that npm version adds
NEW_VERSION=${NEW_VERSION#v}

echo "New version: $NEW_VERSION"

# Stage the changes
git add .

# Commit the version bump
git commit -m "Bump version to $NEW_VERSION"

# Create and push the tag
git tag "v$NEW_VERSION"

echo "Pushing changes and tag..."
git push origin main
git push origin "v$NEW_VERSION"

echo "✅ Successfully bumped version to $NEW_VERSION and pushed tag v$NEW_VERSION"
