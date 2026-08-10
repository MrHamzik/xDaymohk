import re

with open('app/globals.css', 'r') as f:
    css = f.read()

bad_css = """.samashki-house-badge:hover,
.samashki-place-badge:hover,
.samashki-house-badge:active,

.samashki-profile-badge {"""

good_css = """.samashki-house-badge:hover,
.samashki-place-badge:hover,
.samashki-house-badge:active,
.samashki-place-badge:active {
  transform: scale(1.1);
  z-index: 9999 !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}

.samashki-profile-badge {"""

css = css.replace(bad_css, good_css)

# Also fix .samashki-place-badge:active duplicate
css = re.sub(r'\.samashki-place-badge:active \{\s*transform: scale\(1\.3\);\s*z-index: 9999 !important;\s*box-shadow: 0 4px 12px rgba\(0,0,0,0\.5\);\s*\}\s*', '', css)

# Make sure .samashki-marker-wrapper has transition for opacity
if 'opacity 0.3s ease' not in css:
    css = css.replace('.samashki-marker-wrapper {', '.samashki-marker-wrapper {\n  transition: opacity 0.3s ease;')

with open('app/globals.css', 'w') as f:
    f.write(css)
