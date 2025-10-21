#!/bin/zsh

# Generate the function file and source it
PATHFUNCS_FILE="$(python3 $DOTFILES_DIR/src/python/pathfuncs.py)"
if [[ -f "$PATHFUNCS_FILE" ]]; then
  source "$PATHFUNCS_FILE"
else
  echo "Failed to generate path functions"
fi

# Source all sibling .sh files
SCRIPT_DIR="$(dirname "$0")"
for f in "$SCRIPT_DIR"/*.sh; do
  [[ "$f" == "$0" ]] && continue  # skip self
  [[ -f "$f" ]] && source "$f"
done


function sb() {
  if [ "$1" = "prod" ]; then
    ssh-keygen -R ssh-app.spaceback.me
    ssh -i ~/.ssh/aws-eb -tt root@ssh-app.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
  elif [ "$1" = "stage" ]; then
    ssh-keygen -R ssh-app-stage.spaceback.me
    ssh -i ~/.ssh/aws-eb -tt root@ssh-app-stage.spaceback.me 'echo "echo \"RUN: cd ~ && source activate && cd /app && rails c\" && source /root/activate" | bash -s && bash -i'
  else
    echo "Invalid argument. Use 'prod' or 'stage' to run the command."
  fi
}
