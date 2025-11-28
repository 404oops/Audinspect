set -e

BUMP_TYPE=${1:-patch}

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Error: Invalid bump type. Use 'patch', 'minor', or 'major'"
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

echo "Bumping $BUMP_TYPE version..."
NEW_VERSION=$(npm version $BUMP_TYPE --no-git-tag-version)

NEW_VERSION=${NEW_VERSION#v}

echo "New version: $NEW_VERSION"

git add .

git commit -m "Bump version to $NEW_VERSION"

git tag "v$NEW_VERSION"

echo "Pushing changes and tag..."
git push origin main
git push origin "v$NEW_VERSION"

echo "✅ Successfully bumped version to $NEW_VERSION and pushed tag v$NEW_VERSION"

