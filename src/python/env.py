import os

items = [
    (k, v)
    for k, v in os.environ.items()
    if k != 'PATH'
]

items.sort(key=lambda x: x[0])

for k, v in items:
    print((k, v))
