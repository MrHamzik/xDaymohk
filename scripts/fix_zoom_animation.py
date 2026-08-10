with open('app/globals.css', 'r') as f:
    css = f.read()

# Remove transition: none !important from .samashki-leaflet-marker
bad_rule = """.samashki-leaflet-marker {
  transition: none !important;
}"""
css = css.replace(bad_rule, "")

# Add fade logic for zoom
# The user wants them to fade out when zoomed out far.
# In InteractiveMap.tsx, we can add a class based on map zoom.

with open('app/globals.css', 'w') as f:
    f.write(css)
