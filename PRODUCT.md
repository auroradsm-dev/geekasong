# Geekasong: product notes

How I think about this product: the problem, the decisions, what I left out, and how I'd know it works. The engineering side is in the [README](README.md).

## The problem

I wanted a music quiz to play with friends and family at weekends: all ages, all genres, in English and French. Running a blind test by hand means one person juggles a playlist, a timer and the scores, and arguments about who answered first. The goal: the fun of a TV style blind test, with no setup and no one stuck being the referee.

## Who it's for

* **The host:** the person with the laptop or the speaker. They start the game and judge answers.
* **The players:** anyone in the room with a phone. No app, no account, join with a code or a QR code.
* **Mixed groups:** kids and grandparents in the same game, so categories range from cartoon themes to classic rock.

## Key decisions

| Decision | Why | What I said no to |
|---|---|---|
| Play it like a YouTube blind test: the music plays, first to buzz shouts the answer | Shouting the answer is the fun part, and it works for every age | Typing answers or multiple choice |
| The host device plays the music and gives the points | One sound source keeps everyone together, and a person judges better than string matching | Music on every phone |
| Two play styles: phone buzzers, or one device only | Some groups want buzzers, others just want to play around one screen | Forcing everyone to join on a phone |
| The server decides who buzzed first | Fair results on any network, and the answer is never sent to players' phones, so nobody can peek | Letting each phone decide |
| Free 30 second Deezer previews | Enough to recognise a song, with no licensing cost | Paid music licensing |
| Free and non commercial | It's for playing with people I know, not a business | Ads, accounts, payments |
| Realtime rooms on PartyKit (Cloudflare) | Built for live rooms, with no database to run | Supabase realtime |
| English, French, or both | That's how my friends and family actually play | English only |

## What I built first, and why in that order

1. **Blind test:** the core loop. If this isn't fun, nothing else matters.
2. **Find the year:** a second mode that works without anyone shouting, with points for getting close.
3. **A real domain and production deploy:** so friends can play without me setting anything up.
4. **More modes:** song with a word (others vote), mashup (two songs at once), famous faces (two photos morphed into one), and a mixed game that rotates through them all.
5. **Custom buzzer sounds** recorded by each player.

## What I deliberately left out

* **Voice or microphone judging:** parked. The host judging is good enough and much simpler.
* **Finish the lyrics:** parked.
* **A sing along "keep singing in time" mode:** scrapped. Too hard to judge fairly.
* **Accounts, history, leaderboards across games:** not needed for a weekend game.

## How I'd know it works

* Games finished versus games started: do groups play to the podium?
* Rounds per session and "play again" rate: do they come back for another game?
* Which modes and categories get picked: what to build more of.
* Join drop off: how many people open the join link but never join the room.

## What's next

Difficulty levels, a pixelated famous faces mode that sharpens over time, and non music rounds.
