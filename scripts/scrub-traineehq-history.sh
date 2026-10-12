#!/usr/bin/env bash
#
# Purge real trainee records from the history of dr-redragon/traineehq.
#
# public/teaching-register.html, and two files under public/teaching-register/,
# were committed with a real cohort's names alongside sickness absences and
# maternity statuses. They were deleted from the tree in August, but every
# earlier commit still contains them, and the repository was public. One more
# real name sits in scripts/scrub-register-history.sh as that script's search
# "canary". This rewrites every branch and tag so none of it remains.
#
# Run it from a machine whose git credentials can force-push to every branch
# (a cloud coding session can only push to its own branch).
#
# READ THIS BEFORE RUNNING
#
#   * It rewrites history, so commit hashes change on every branch that
#     contains those commits. Anyone with a clone must re-clone; Lovable's
#     GitHub sync may need reconnecting.
#   * It force-pushes, guarded by --force-with-lease: a branch somebody pushed
#     to while this ran is refused rather than overwritten. Re-run to pick it up.
#   * Pull-request refs (refs/pull/*) are read-only and still reach the old
#     commits. Only GitHub Support can purge them; ask them to, quoting the
#     repository, after this has run.
#   * Forks and existing clones keep their copies. This cannot reach them.
#   * A full backup bundle of the original is written next to the work tree;
#     delete it once you are satisfied, since it contains the data too.
#
# Requires git-filter-repo:  pipx install git-filter-repo   (or: pip install git-filter-repo)

set -euo pipefail

REPO_URL="https://github.com/dr-redragon/traineehq"
WORKDIR="${1:-$(mktemp -d /tmp/scrub-traineehq.XXXXXX)}"

PATHS=(
  public/teaching-register.html
  public/teaching-register/index.html
  public/teaching-register/checkin.html
)

command -v git-filter-repo >/dev/null 2>&1 || {
  echo "git-filter-repo is not installed:  pipx install git-filter-repo"
  exit 1
}

echo "This rewrites history on every branch of ${REPO_URL} and force-pushes."
read -r -p "Type 'rewrite' to continue: " confirm
[ "$confirm" = "rewrite" ] || { echo "Aborted."; exit 1; }

cd "$WORKDIR"
git clone --mirror "$REPO_URL" mirror.git
cd mirror.git
git bundle create ../BACKUP-before-scrub.bundle --all
git for-each-ref --format='%(objectname) %(refname)' refs/heads refs/tags > ../refs-before.txt

# The canary is read from the script itself so this file never has to name a
# real person. If it has already been redacted there is nothing to replace.
canary="$(git show refs/heads/main:scripts/scrub-register-history.sh 2>/dev/null \
  | sed -n 's/^CANARY="\(.*\)"$/\1/p')"
replace_args=()
if [ -n "$canary" ] && [ "$canary" != "REDACTED-TRAINEE-NAME" ]; then
  printf '%s==>REDACTED-TRAINEE-NAME\n' "$canary" > ../replacements.txt
  replace_args=(--replace-text ../replacements.txt)
fi

path_args=()
for p in "${PATHS[@]}"; do path_args+=(--path "$p"); done

git filter-repo --force --invert-paths "${path_args[@]}" "${replace_args[@]}"

echo
echo "Checking nothing survived..."
for p in "${PATHS[@]}"; do
  if [ -n "$(git log --all --format=%H -- "$p")" ]; then
    echo "  STILL PRESENT: $p"; exit 1
  fi
done
if [ -n "$canary" ] && [ "$canary" != "REDACTED-TRAINEE-NAME" ]; then
  if git grep -q -F "$canary" $(git rev-list --all) -- 2>/dev/null; then
    echo "  The canary name is still in some commit."; exit 1
  fi
fi
echo "  clean."

git remote add origin "$REPO_URL"
push_args=()
while read -r old ref; do
  new="$(git rev-parse -q --verify "$ref" || true)"
  [ -n "$new" ] || continue
  push_args+=("--force-with-lease=$ref:$old" "+$new:$ref")
done < ../refs-before.txt

echo
echo "Pushing $(( ${#push_args[@]} / 2 )) branches and tags..."
git push origin "${push_args[@]}"

echo
echo "Done. Now:"
echo "  1. Ask GitHub Support to purge cached objects and refs/pull/* for ${REPO_URL}."
echo "  2. Re-clone everywhere (and reconnect Lovable if its sync breaks)."
echo "  3. Delete ${WORKDIR}/BACKUP-before-scrub.bundle once you no longer need it."
