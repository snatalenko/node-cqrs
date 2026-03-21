#!/bin/bash

set -e

comingTag=$1 # can be empty
intermediaryTags=$(git tag -l "v*-*")
tagsToDelete=()

if [[ -n "$comingTag" ]]; then
	echo "Creating $comingTag"
fi

# Determine the pre-release level of a tag:
#   0 = numeric-only / alpha (lowest)
#   1 = beta
#   2 = rc
preid_level() {
	local tag=$1
	local preid="${tag#*-}"
	preid="${preid%%.*}"

	if [[ "$preid" == "rc" ]]; then
		echo 2
	elif [[ "$preid" == "beta" ]]; then
		echo 1
	else
		# alpha or purely numeric
		echo 0
	fi
}

# Check if a tag (existing or coming) supersedes the given intermediary tag.
# Supersession hierarchy:
#   release > rc > beta > alpha/numeric
is_superseded() {
	local tag=$1
	local level
	level=$(preid_level "$tag")
	local baseVersion="${tag%%-*}"

	# Check if a release tag exists or is coming
	if [[ $(git tag -l "$baseVersion") ]] || [[ "$comingTag" == "$baseVersion" ]]; then
		echo "Release tag $baseVersion exists (or is coming), $tag can be removed"
		return 0
	fi

	# Check if a higher-level pre-release tag exists or is coming
	if (( level < 2 )); then
		# rc supersedes beta, alpha, numeric
		if [[ $(git tag -l "$baseVersion-rc.*") ]] || [[ "$comingTag" == "$baseVersion-rc."* ]]; then
			echo "RC tag for $baseVersion exists (or is coming), $tag can be removed"
			return 0
		fi
	fi

	if (( level < 1 )); then
		# beta supersedes alpha, numeric
		if [[ $(git tag -l "$baseVersion-beta.*") ]] || [[ "$comingTag" == "$baseVersion-beta."* ]]; then
			echo "Beta tag for $baseVersion exists (or is coming), $tag can be removed"
			return 0
		fi
	fi

	echo "No successors for $tag found"
	return 1
}

for intermediaryTag in $intermediaryTags; do
	if is_superseded "$intermediaryTag"; then
		tagsToDelete+=("$intermediaryTag")
	fi
done

if (( ${#tagsToDelete[@]} )); then
	echo ""
	echo "Tags to remove: ${tagsToDelete[*]}"
	echo ""

	# Remote deletion: prompt for confirmation unless running in CI
	deleteRemote=true
	if [[ -z "$CI" ]]; then
		read -r -p "Delete ${#tagsToDelete[@]} tag(s) from remote? [Y/n] " answer
		if [[ "$answer" =~ ^[Nn] ]]; then
			deleteRemote=false
		fi
	fi

	if [[ "$deleteRemote" == true ]]; then
		echo "Removing tags from remote..."
		git push --no-verify --delete origin "${tagsToDelete[@]}" || true
	else
		echo "Skipping remote tag deletion."
	fi

	echo "Removing tags locally..."
	git tag -d "${tagsToDelete[@]}"
fi
