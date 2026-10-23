# Geekasong roadmap

What I'm considering next, written the way I'd hand it to a team: who it's for, why it matters, how we'd know it's done, and what's still open. The reasoning behind the product so far is in [PRODUCT.md](PRODUCT.md).

**Next:** 1, 2 · **Ideas:** 3, 4 · **Parked:** 5, 6


## 1. Difficulty levels (Easy, Medium, Hard) for every game

*Status: next*

**As a** host with a mixed group (kids, adults, music geeks)
**I want** to pick a difficulty before the game starts
**So that** everyone has a fair chance and nobody gets bored

**Why:** the same playlist is too easy for some groups and impossible for others. Difficulty is the cheapest way to make one game work for every table.

**Acceptance criteria**
- [ ] The host chooses Easy, Medium or Hard in the lobby (default: Medium)
- [ ] The choice applies to every mode in the game, including the mixed game
- [ ] The level is shown on the host screen during play
- [ ] Each mode has a written definition of what changes at each level

**Open questions**
- What makes a song harder: less popular tracks, a shorter clip, or starting the preview mid song?
- Find the year: should Hard narrow the points (exact year only)?
- Famous faces: fewer hints, or hints that arrive later?

## 2. Famous faces: pixelated photo that sharpens over time

*Status: next*

**As a** player
**I want** the famous face to start pixelated and get clearer every few seconds
**So that** answering early is a gamble and the tension builds

**Why:** the current morph shows the full picture straight away, so fast players win immediately. Revealing gradually rewards both quick guessers and patient ones.

**Acceptance criteria**
- [ ] The photo starts heavily pixelated and sharpens in steps until the end of the round
- [ ] Buzzing earlier is visibly riskier: the image level at buzz time is shown at the reveal
- [ ] Works on the host screen at TV size without lag
- [ ] Existing hints (category, then initials) keep their current timing

**Open questions**
- Replace the morph, or offer pixelated as a variant?
- More points for buzzing at a blurrier stage?

## 3. New round type: reversed phrases

*Status: idea*

**As a** group that wants a break from music
**I want** a round where a famous phrase, quote or song line plays or shows backwards
**So that** the game has variety and people who don't know music still score

**Why:** not everyone at the table is a music fan. Non music rounds keep them in the game, especially in a mixed game.

**Acceptance criteria**
- [ ] A new mode "Reversed phrases" in the mode picker, also included in the mixed game
- [ ] Works in English and French
- [ ] Uses the same buzz, judge and points flow as blind test
- [ ] At least 50 phrases per language at launch

**Open questions**
- Text reversed on screen, audio reversed, or both?
- Where do the phrases come from, and are there rights issues with song lines?

## 4. Quiz show mode: the host asks the questions

*Status: idea*

**As a** host who likes playing presenter
**I want** a quiz show mode where I read questions out and players buzz in
**So that** we can play a classic TV quiz format with the same buzzers

**Why:** the buzzer system already works. A host led quiz reuses it for any topic, not just music.

**Acceptance criteria**
- [ ] The host screen shows the question and answer; player phones show only the buzzer
- [ ] The host can load a set of questions before the game
- [ ] Same buzz order, lock out on a wrong answer, and scoring as blind test
- [ ] The answer never reaches player phones before the reveal

**Open questions**
- Where do questions come from: written by the host, a ready made pack, or generated?

## 5. Voice judging: the app listens to the answer

*Status: parked*

**Idea:** after a buzz, the app listens to the player's answer and checks it against the song title and artist, so the host can play too.

**Why it's parked:** the host judging works well, handles accents and partial answers, and keeps the game social. Voice judging adds microphone permissions, two languages to recognise and edge cases ("that's the cover version!"). Revisit if hosts say judging stops them from enjoying the game.

## 6. Finish the lyrics

*Status: parked*

**Idea:** the song stops and the player has to sing the next line.

**Why it's parked:** fun, but it needs lyrics data with licensing questions, and judging a sung line is subjective. Blind test, find the year and song with a word cover the music side for now.
