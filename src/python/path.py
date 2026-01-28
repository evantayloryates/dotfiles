import os
import re
import random

COLOR_CODES = {
    'black_bold_bright': ['\033[1;90m', '\033[0m'],
    'black_bold': ['\033[1;30m', '\033[0m'],
    'black_bright': ['\033[90m', '\033[0m'],
    'black_dim_bright': ['\033[2;90m', '\033[0m'],
    'black_dim': ['\033[2;30m', '\033[0m'],
    'black': ['\033[30m', '\033[0m'],
    'blue_bold_bright': ['\033[1;94m', '\033[0m'],
    'blue_bold': ['\033[1;34m', '\033[0m'],
    'blue_bright': ['\033[94m', '\033[0m'],
    'blue_dim_bright': ['\033[2;94m', '\033[0m'],
    'blue_dim': ['\033[2;34m', '\033[0m'],
    'blue': ['\033[34m', '\033[0m'],
    'cyan_bold_bright': ['\033[1;96m', '\033[0m'],
    'cyan_bold': ['\033[1;36m', '\033[0m'],
    'cyan_bright': ['\033[96m', '\033[0m'],
    'cyan_dim_bright': ['\033[2;96m', '\033[0m'],
    'cyan_dim': ['\033[2;36m', '\033[0m'],
    'cyan': ['\033[36m', '\033[0m'],
    'green_bold_bright': ['\033[1;92m', '\033[0m'],
    'green_bold': ['\033[1;32m', '\033[0m'],
    'green_bright': ['\033[92m', '\033[0m'],
    'green_dim_bright': ['\033[2;92m', '\033[0m'],
    'green_dim': ['\033[2;32m', '\033[0m'],
    'green': ['\033[32m', '\033[0m'],
    'magenta_bold_bright': ['\033[1;95m', '\033[0m'],
    'magenta_bold': ['\033[1;35m', '\033[0m'],
    'magenta_bright': ['\033[95m', '\033[0m'],
    'magenta_dim_bright': ['\033[2;95m', '\033[0m'],
    'magenta_dim': ['\033[2;35m', '\033[0m'],
    'magenta': ['\033[35m', '\033[0m'],
    'red_bold_bright': ['\033[1;91m', '\033[0m'],
    'red_bold': ['\033[1;31m', '\033[0m'],
    'red_bright': ['\033[91m', '\033[0m'],
    'red_dim_bright': ['\033[2;91m', '\033[0m'],
    'red_dim': ['\033[2;31m', '\033[0m'],
    'red': ['\033[31m', '\033[0m'],
    'white_bold_bright': ['\033[1;97m', '\033[0m'],
    'white_bold': ['\033[1;37m', '\033[0m'],
    'white_bright': ['\033[97m', '\033[0m'],
    'white_dim_bright': ['\033[2;97m', '\033[0m'],
    'white_dim': ['\033[2;37m', '\033[0m'],
    'white': ['\033[37m', '\033[0m'],
    'yellow_bold_bright': ['\033[1;93m', '\033[0m'],
    'yellow_bold': ['\033[1;33m', '\033[0m'],
    'yellow_bright': ['\033[93m', '\033[0m'],
    'yellow_dim_bright': ['\033[2;93m', '\033[0m'],
    'yellow_dim': ['\033[2;33m', '\033[0m'],
    'yellow': ['\033[33m', '\033[0m'],
}
NEUTRALS = [
    'white_bold_bright',
    'white_bold',
    'white_bright',
    'white_dim_bright',
    'white_dim',
    'white',
    'black_bold_bright',
    'black_bold',
    'black_bright',
    'black_dim_bright',
    'black_dim',
    'black',
]


def filtered_colors(checks):
    if checks:
        return [color for color in COLOR_CODES.keys() if any(check in color for check in checks)]
    else:
        return COLOR_CODES.keys()


def random_color(checks=[]):
    # if checks is a string, wrap in []
    if isinstance(checks, str):
        checks = [checks]
    return random.choice(filtered_colors(checks))

# COLOR_1 = 'cyan_bright'
# COLOR_2 = 'cyan_dim_bright'
# COLOR_1 = 'blue_bright'
# COLOR_2 = 'blue_dim_bright'
# COLOR_1 = 'green_bright'
# COLOR_2 = 'green_dim_bright'
# COLOR_1 = 'green_bright'
# COLOR_2 = 'blue_bright'
# COLOR_1 = 'white_bright'
# COLOR_2 = 'black_bright'
# COLOR_1 = 'magenta_bright'
# COLOR_2 = 'magenta_dim_bright'


def c(s, color='white'):
    open_code, close_code = COLOR_CODES[color]
    return f'{open_code}{s}{close_code}'


path_items = os.environ.get('PATH', '').split(':')
normalized = []

for item in path_items:
    # Replace multiple leading slashes with a single one
    item = re.sub(r'^/+', '/', item)
    normalized.append(item)

# dedupe
normalized = list(set(normalized))


def segment_count(path):
    # split on '/', ignore empty segments
    return len([p for p in path.split('/') if p])


# sort: first by segment count, then alphabetically
normalized.sort(key=lambda p: (segment_count(p), p))

print()

# GOOD:
#  - white_bold_bright
#  - black_bold_bright
# override_1 = random_color(['black'])
override_1 = 'black_bold_bright'
override_2 = override_1
# slash_color = 'white'
# slash_color = 'magenta_bold_bright'
slash_color = random_color(['bright'])
# for idx, i in enumerate(normalized[:5]):
print(f"PRIMARY: {override_1}")
print(f"SLASH:   {slash_color}")
print()

for idx, i in enumerate(normalized):
    while True:
        COLOR_1 = override_1 if override_1 else random_color()
        COLOR_2 = override_2 if override_2 else random_color()
        # if COLOR_1 != COLOR_2:
        if True:
            break
    color = COLOR_1 if idx % 2 == 0 else COLOR_2
    segments = [seg for seg in i.split('/') if seg]
    colored_segments = [c(seg, color) for seg in segments]
    colored_path = c('/', slash_color) + c('/',
                                           slash_color).join(colored_segments) if segments else ''
    # print(f"{colored_path} ({slash_color})")
    print(f"{colored_path}")

print()
