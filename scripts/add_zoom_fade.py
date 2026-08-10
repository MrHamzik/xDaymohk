import re

with open('components/InteractiveMap.tsx', 'r') as f:
    content = f.read()

# Add zoomend listener
zoom_listener = """      map.on('click', (event) => {
        onSelectRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
        onClearSelectionRef.current?.();
      });
      
      const updateZoomClass = () => {
        if (!containerRef.current) return;
        if (map.getZoom() <= 14) {
          containerRef.current.classList.add('zoomed-out');
        } else {
          containerRef.current.classList.remove('zoomed-out');
        }
      };
      map.on('zoomend', updateZoomClass);
      updateZoomClass();
"""

content = content.replace("""      map.on('click', (event) => {
        onSelectRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng });
        onClearSelectionRef.current?.();
      });""", zoom_listener)

with open('components/InteractiveMap.tsx', 'w') as f:
    f.write(content)

with open('app/globals.css', 'r') as f:
    css = f.read()

# Add .zoomed-out .samashki-marker-wrapper { opacity: 0; pointer-events: none; }
zoom_css = """
.zoomed-out .samashki-marker-wrapper {
  opacity: 0 !important;
  pointer-events: none !important;
  transform: scale(0.5);
}
"""

if 'zoomed-out' not in css:
    css = css + zoom_css

# Make sure samashki-marker-wrapper has transition for transform as well
css = css.replace("transition: opacity 0.3s ease;", "transition: opacity 0.3s ease, transform 0.3s ease;")

with open('app/globals.css', 'w') as f:
    f.write(css)

