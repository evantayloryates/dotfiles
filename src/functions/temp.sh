# This file is for one-offs that are safe to delete 

# Apr 10, 2026
border() {
  ./border_color.sh "$1" | tr -d '\n' | pbcopy
}