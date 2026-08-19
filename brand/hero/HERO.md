# Collection hero stills

Copy into `collection/public/images/`:

- `hero-night.jpg` — lamp on, helix-red shade, iron spiral stair in the left third
- `hero-day.jpg` — same room, daylight, lamp off, same stair

CSS that must travel with them:

```css
.hero-photo {
  object-fit: cover;
  object-position: left center; /* the stair is in the left third */
}
```

Do not generate new stills. Do not put type in the photograph.
