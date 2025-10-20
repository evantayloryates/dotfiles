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


function launch ()
{
	# Initialize dirs in case they don't exist
	mkdir /Library/LaunchDaemons 2>/dev/null
	mkdir ~/Library/LaunchDaemons 2>/dev/null
	mkdir /Library/LaunchAgents 2>/dev/null
	mkdir ~/Library/LaunchAgents 2>/dev/null

	# System and User Daemons
	if [ "$1" = "d" ]; then
		print_daemons
	
	# System and User Agents
	elif [ "$1" = "a" ]; then
		print_agents

	# System and User Daemons and Agents
	elif [ "$1" = "" ]; then
		print_agents
		print_daemons
	
	# Invalid arg
	else
		echo "
Invalid argument: \`$1\`

Valid commands:
	\`launch d\` => Open launch daemon directories
	\`launch a\` => Open launch agent directories
	\`launch\`   => Open launch agent and daemon directories
"
	fi
}