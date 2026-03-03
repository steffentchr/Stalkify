# Stalkify

**Tagline:** Last.fm + Spotify bundled into goodness

## Overview

Stalkify is a service that makes it possible to have auto-updating Spotify playlists created from Last.fm users' listening data.

## Core Functionality

Users can visit the app's website, enter a Last.fm username (e.g., "steffentchr"), and instantly get access to 6 dynamic, auto-updating Spotify playlists:

1. **Stalkify: [username]'s recent** - Recently played tracks
2. **Stalkify: [username]'s all-time top tracks** - All-time favorite tracks
3. **Stalkify: [username]'s top tracks this week** - Top tracks from the current week
4. **Stalkify: [username]'s 3-month top tracks** - Top tracks from the last 3 months
5. **Stalkify: [username]'s 6-months top tracks** - Top tracks from the last 6 months
6. **Stalkify: [username]'s top tracks this year** - Top tracks from the current year

## Design & Implementation

- **Design Reference:** The UI should match the design from the legacy Stalkify service as closely as possible
- **Legacy Code:** Available at https://github.com/steffentchr/legacy-stalkify/
- **HTML Mockups:** See `design-reference/` folder for flat HTML templates showcasing the design
- **Technical Approach:** New implementation using a modern tech stack

## Design Details

### Visual Design
- **Layout:** Fixed 380px centered container with 40px margins
- **Typography:** Helvetica/Arial sans-serif font stack
  - h1: 80px uppercase, bold, centered with text shadow
  - h2: 35px bold, centered
  - Body: 13-18px for various content
- **Color Palette:**
  - Primary: Black (#000), dark gray (#222, #333)
  - Accents: Sage green (#B5C6A8), mustard yellow (#BDBD1D)
  - Backgrounds: White, light gray (#eee)
  - Meta/footer text: Gray (#888, #999, #aaa)

### User Interface Components

1. **Landing Page** (`design-reference/index.html`)
   - Large "STALKIFY" logo heading
   - Tagline: "Last.fm + Spotify bundled into goodness"
   - Single-line search form (text input + submit button)
   - Informational message about the service
   - "Listen in" sidebar showing recent user activity

2. **Results Page** (`design-reference/results.html`)
   - Username as h2 heading
   - Table of 6 playlists with right-aligned labels and Spotify URIs
   - Grid of top artists (126x126px squares with overlays)
   - Artist images from Last.fm with name and play count overlays
   - Clean, minimalist presentation

3. **Loading Page** (`design-reference/loading.html`)
   - Processing message with username
   - Animated loading indicator
   - Status table showing playlist creation progress
   - Auto-refresh capability

### Key Features

- **Auto-Updating Playlists:** Playlists sync with Last.fm data automatically
- **Multiple Time Periods:** Recent, all-time, weekly, 3-month, 6-month, and yearly views
- **Artist Visualization:** Grid display of top 48 artists with play counts
- **Spotify Integration:** Direct Spotify URI links for instant playlist access
- **Real-Time Activity:** "Listen in" feed showing recently processed users
- **Simple UX:** Single text input for username lookup

### Technical Architecture (Legacy Reference)

- **APIs:** Last.fm API for listening data, Spotify API for playlist creation
- **Data Points:**
  - Recent tracks feed
  - Top artists (all-time and weekly)
  - Top tracks across multiple time periods
- **Processing:** Async playlist generation with status updates
- **Storage:** User data, playlists, and artist information

## Goal

Create a seamless bridge between Last.fm's listening history tracking and Spotify's playlist ecosystem, allowing users to automatically sync their music taste across both platforms.
