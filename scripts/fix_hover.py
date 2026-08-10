with open('app/globals.css', 'r') as f:
    css = f.read()

# Change scale(1.1) to scale(1.05) or remove it
css = css.replace('transform: scale(1.1);', 'transform: scale(1.05);')
css = css.replace('transform: scale(1.3);', 'transform: scale(1.15);') # for profile badge too

with open('app/globals.css', 'w') as f:
    f.write(css)
