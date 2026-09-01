#!/usr/bin/env bash
#
# Purge the leaked cohort data from the history of dr-redragon/ent-teaching-register.
#
# A real cohort — 46 named trainees with attendance, sickness, maternity and
# LTFT records — was committed to that public repository as hard-coded seed
# data. Commit c30acce removed it from the current files, so it is no longer
# served, but every earlier commit still contains it and GitHub will happily
# show you those blobs. This rewrites the history so they are gone.
#
# READ THIS BEFORE RUNNING
#
#   * It rewrites every commit, so every commit hash changes. Anyone with a
#     clone must re-clone; open pull requests will need recreating.
#   * It force-pushes. That is the point, and it is not reversible from the
#     remote side — the backup branch this script makes locally is your undo.
#   * GitHub keeps unreferenced objects reachable for a while even after a
#     force-push, and caches them on the API. When this finishes, ask GitHub
#     Support to purge the repository's cached views, quoting the commit SHAs.
#   * Any fork, or anyone who cloned it while the data was public, keeps their
#     copy. Rewriting history cannot reach those.
#
# BEFORE running this, make the repository private in Settings → General →
# Danger Zone. That closes public access in one click; this script is the
# thorough follow-up, not the emergency stop.
#
# Requires git-filter-repo:  pipx install git-filter-repo   (or: pip install git-filter-repo)

set -euo pipefail

REPO_URL="https://github.com/dr-redragon/ent-teaching-register"
WORKDIR="${1:-/tmp/scrub-ent-register}"
TARGET_FILE="index.html"
# Any commit whose index.html contains this string carries the cohort.
CANARY="Kristijonas Milinis"

command -v git-filter-repo >/dev/null 2>&1 || {
  echo "git-filter-repo is not installed."
  echo "  pipx install git-filter-repo   (or: pip install git-filter-repo)"
  exit 1
}

echo "This rewrites ALL history of ${REPO_URL} and force-pushes."
read -r -p "Type 'rewrite' to continue: " confirm
[ "$confirm" = "rewrite" ] || { echo "Aborted."; exit 1; }

rm -rf "$WORKDIR"
# filter-repo needs the whole history, so this is a full clone, not shallow.
git clone "$REPO_URL" "$WORKDIR"
cd "$WORKDIR"

echo
echo "Commits currently carrying the cohort:"
git rev-list --all | while read -r sha; do
  if git show "$sha:$TARGET_FILE" 2>/dev/null | grep -q "$CANARY"; then echo "  $sha"; fi
done

# Keep an untouched copy of the original history, in case you need to go back.
git branch backup-before-scrub

# Replace the seed block wherever it appears, in every commit, rather than
# deleting index.html — the file itself must survive, only its payload goes.
cat > /tmp/scrub-replacements.txt <<'REPL'
regex:function seedData\(\)\{.*?\n\}==>function seedData(){\n  return { trainees:[], sessions:[], attendance:{}, excused:[], status:[] };\n}
REPL

git filter-repo --force --replace-text /tmp/scrub-replacements.txt

echo
echo "Verifying no commit still contains the cohort..."
remaining=0
git rev-list --all | while read -r sha; do
  if git show "$sha:$TARGET_FILE" 2>/dev/null | grep -q "$CANARY"; then
    echo "  STILL PRESENT in $sha"; remaining=1
  fi
done
[ "$remaining" -eq 0 ] && echo "  clean."

echo
echo "Rewritten locally. Nothing has been pushed yet."
echo "Review with: git -C $WORKDIR log --oneline | head"
echo
echo "When you are satisfied, push it:"
echo "  git -C $WORKDIR remote add origin $REPO_URL   # filter-repo drops the remote"
echo "  git -C $WORKDIR push --force --all origin"
echo "  git -C $WORKDIR push --force --tags origin"
echo
echo "Then ask GitHub Support to purge the cached objects."
