import os
import random

# Get the DOTFILES_DIR environment variable
dotfiles_dir = os.getenv('DOTFILES_DIR')

# Build the path to the words.txt file
words_file_path = os.path.join(dotfiles_dir, 'src', '__data', 'words.txt')

# Open the words.txt file
with open(words_file_path, 'r') as file:
    # Read all the lines in the file
    lines = file.readlines()

# Select 5 random lines
selected_lines = random.sample(lines, 5)

# Remove newline characters from each line
selected_lines = [line.strip() for line in selected_lines]

# Join the lines with "-" in between
joined_lines = "-".join(selected_lines)

# print reminder that words list can be opened with the "words" command
print("Note: use command 'words' to edit word list\n")

# Print the result using bold text
print(f"\033[1m{joined_lines}\033[0m")