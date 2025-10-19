import os, sys


path_items = os.environ.get('PATH').split(':')
path_items.sort()
for i in path_items:
	print(i)
