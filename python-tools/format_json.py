import json
import sys

try:
	file = argv[1]
except:
	print("Please include a file to format")
	sys.exit()

print(file)