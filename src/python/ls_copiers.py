import sys

def main():
  if len(sys.argv) > 1:
    value = sys.argv[1]
    sys.stdout.write(value)

if __name__ == '__main__':
  main()
