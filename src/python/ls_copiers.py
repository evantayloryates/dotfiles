import sys

def main():
  if len(sys.argv) > 1:
    copiers_path = sys.argv[1]
    sys.stdout.write(f"{copiers_path}\n")

if __name__ == '__main__':
  main()
