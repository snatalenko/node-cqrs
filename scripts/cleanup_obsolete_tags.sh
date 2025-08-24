#!/bin/bash

set -e

comingTag=$1 # can be empty
intermediaryTags=$(git tag -l "v*-*")
tagsToDelete=()

if [[ ! -z "$comingTag" ]]; then
	echo "Creating $comingTag"
fi

# Check all intemediary tags (containing "-") 
# and drop ones that have successor tags created (i.e. "1.80.0" for "1.80.0-0", or ""
for intermediaryTag in $intermediaryTags
do
	releaseTag=${intermediaryTag%%-*}

	if [ $(git tag -l "$releaseTag") ]; then
		echo "Release tag $releaseTag exists, $intermediaryTag can be removed"
		tagsToDelete+=($intermediaryTag)

	elif [[ "$comingTag" = "$releaseTag" ]]; then
		echo "Release tag $comingTag is about to be created, $intermediaryTag can be removed"
		tagsToDelete+=($intermediaryTag)

	elif [[ "$intermediaryTag" == *"-rc"* ]]; then
		echo "No release tag for $intermediaryTag found"

	elif [ $(git tag -l "$releaseTag-rc.*") ]; then
		echo "Pre-release tag $releaseTag-rc.* exists, $intermediaryTag can be removed"
		tagsToDelete+=($intermediaryTag)

	elif [[ "$comingTag" == "$releaseTag-rc."* ]]; then
		echo "Pre-release tag $comingTag is about to be created, $intermediaryTag can be removed"
		tagsToDelete+=($intermediaryTag)

	else
		echo "No successors for $intermediaryTag found"
	fi
done

if (( ${#tagsToDelete[@]} )); then
	echo "Removing tags from remote..."
	git push --no-verify --delete origin ${tagsToDelete[@]} || true

	echo "Removing tags locally..."
	git tag -d ${tagsToDelete[@]}
fi
