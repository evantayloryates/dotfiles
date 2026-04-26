aws() {
  if [ "$1" = 'dev' ]; then
    shift
    AWS_PROFILE=spbk-dev command aws "$@"
  else
    command aws "$@"
  fi
}