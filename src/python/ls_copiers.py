import sys

def main():
  if len(sys.argv) > 1:
    copiers_path = sys.argv[1]

    with open(copiers_path, 'r') as f:
      lines = f.read().splitlines()

    # lines is now an array of strings
    for line in lines:
      sys.stdout.write(f'{line}\n')

if __name__ == '__main__':
  main()
