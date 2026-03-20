# GIF Upload Guide

## Problem
Your GIF is 147MB which exceeds GitHub's file size limits:
- Regular files: 25MB max
- Git LFS: 100MB max
- Recommended for README: <10MB

## Solutions

### Option 1: Compress GIF (Recommended)

#### Using ezgif.com (Online, No Install)
1. Go to https://ezgif.com/optimize
2. Upload your `osmroad.gif`
3. Try compression levels:
   - Lossy: 30-50 (reduces colors)
   - Reduce frames: Skip every 2nd frame
   - Resize: Max 800px width
4. Download compressed GIF (aim for <10MB)

### Option 2: Upload to GitHub Releases (Recommended for GitHub)

1. Go to your repo: `https://github.com/YOUR_USERNAME/osmroad`
2. Click "Releases" → "Draft a new release"
3. Tag: `v0.1.0-demo` (or any tag)
4. Title: "Demo Assets"
5. Upload your GIF (even 147MB works here!)
6. Publish release
7. Right-click GIF → "Copy image address"
8. Update README.md with that URL

### Option 3: Upload to Imgur

1. Go to https://imgur.com/upload
2. Upload GIF (max 200MB for free)
3. Get direct image link
4. Update README.md

## Update README

After uploading, replace line 7 in README.md:

```markdown
![OSMRoad Demo](YOUR_ACTUAL_URL_HERE)
```

## File Size Targets

| Format | Target Size | Quality |
|--------|-------------|---------|
| GIF | <10MB | Reduced colors, 10fps |
| MP4 | <5MB | Good quality, 30fps |

## Current Status

- [ ] Compress GIF to <10MB OR
- [ ] Upload to GitHub Releases OR  
- [ ] Upload to Imgur
- [ ] Update README.md with actual URL
