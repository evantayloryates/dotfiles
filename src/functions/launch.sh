
function print_daemons ()
{
	echo -e "${CYAN}System Daemons (${WHITE}/Library/LaunchDaemons${CYAN})${RESET}"
	echo "————————————————————————————————————————"
	ls -1 /Library/LaunchDaemons
	echo -e "\n"
	
	echo -e "${CYAN}User Daemons (${WHITE}~/Library/LaunchDaemons${CYAN})${RESET}"
	echo "—————————————————————————————————————————"
	ls -1 ~/Library/LaunchDaemons
	echo -e "\n"
}

function print_agents ()
{
	echo -e "${CYAN}System Agents (${WHITE}/Library/LaunchAgents${CYAN})${RESET}"
	echo "————————————————————————————————————————"
	ls -1 /Library/LaunchAgents
	echo -e "\n"
	
	echo -e "${CYAN}User Agents (${WHITE}~/Library/LaunchAgents${CYAN})${RESET}"
	echo "—————————————————————————————————————————"
	ls -1 ~/Library/LaunchAgents
	echo -e "\n"
}

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