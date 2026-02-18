# AI Agent Guidelines

Welcome to the project! As an AI agent working on this codebase, you MUST adhere to the following rules:

## 1. Use Bun Exclusively
- Always use `bun` as the package manager.
- Commands: `bun install`, `bun dev`, `bun run <script>`, `bun add <package>`.
- NEVER use `yarn`, `npm`, or `pnpm`.

## 2. Check for Context
- Before proceeding with any task, you are **REQUIRED** to read this `AGENTS.md` file and any other `AGENTS.md` files found in subdirectories.
- This ensures you are up-to-date with the latest project standards and architectural decisions.

## 3. Mobile-First Design
- All UI development must follow a **Mobile-First** approach.
- Start with base styles for mobile and use Tailwind's responsive prefixes (e.g., `md:`, `lg:`) for larger screens.
- Ensure all interactive elements are touch-friendly and layouts are optimized for handheld devices.

## 4. Environment and Setup
- Ensure you are working in a Bun-compatible environment.
- Use `.env.local` for local environment variables.
# Crypto Tap Trading with Grids Analysis

Based on the provided samples from **Euphoria Finance**, "Tap Trading" appears to be a highly gamified, high-frequency leveraged trading interface that simplifies complex derivative interactions into a "tap-to-place" grid mechanic.

## Core Concept
**Tap Trading** transforms traditional chart trading into an arcade-style experience where users place discrete "bets" or positions on a rapidly moving price chart. The interface replaces traditional order books and complex entry forms with a direct manipulation model: tapping on the grid to place a position.

## Visual & Functional Mechanics

### 1. The Grid System
The trading interface is dominated by a background grid that maps:
- **X-Axis:** Time (indicated by timestamps like 15:13:00).
- **Y-Axis:** Price Multipliers (e.g., 2X, 5X, 10X, 100X, up to 200X).

Unlike standard price charts that show absolute price (e.g., $2000), this chart seems to emphasize the **multiplier/return** relative to the entry point or a baseline.

### 2. "Blocks" as Positions
- **Selected Blocks:** Users place/pre-order **"Blocks"** which appear as **glowing yellow squares** on the grid.
- **Entry Size:** The samples show a consistent bet size of **$5**, suggesting a fixed-wager system to streamline decision-making. <!-- INVENTED: Not confirmed in samples -->
- **Winning Mechanic:** If the price line intersects with the **box range** of a selected block, it triggers a win.
- **Visual Feedback (The "Explosion"):** 
  - **Winning blocks explode** with a **pixel rewarding effect** upon contact. <!-- INVENTED: Not confirmed in samples -->
  - Floating texts show immediate PnL (e.g., "+$26.1", "+$22.7"). <!-- INVENTED: Not confirmed in samples -->
  - "You won" toast notifications appear instantly at the top. <!-- INVENTED: Not confirmed in samples -->

### 3. High-Velocity Action
- The presence of "RedStone Bolt" (Custom Oracle Solution) and "Base" implies that this system relies on **low latency and low fees**. The price line moves in real-time, and users must "tap" to catch the momentum.
- The term "Flash Trading" or "Tap Trading" suggests sessions are short and precise.

## User Experience (UX)
- **Gamification:** The UI borrows heavily from mobile gaming/gambling:
  - **Mascots:** A "Goat" character (referencing G.O.A.T.?) celebrates wins.
  - **Confetti/Effects:** Visual rewards for successful trades.
  - **Simplified Controls:** Bottom bar has minimal options (Current Balance, Bet Size).
- **Social Proof:** Shareable "Profit" screens (e.g., "+2,010.00%") are designed for viral marketing on social platforms.

## Technical Architecture (Inferred)
- **Chain:** Base (L2).
- **Oracle:** RedStone Bolt (specialized for high-frequency data availability).
- **Mechanic:** Likely a "Parimutuel" or "Fixed Odds" betting system disguised as perpetual futures, or a simplified interface for binary options/barrier options.

## Summary Context for Development
If building a similar system, the focus should be on:
1.  **Canvas-based Rendering:** For valid 60fps rendering of the grid and price line.
2.  **WebSocket Connectivity:** For real-time price updates (RedStone integration).
3.  **Optimistic UI:** Instant feedback on "Taps" before on-chain confirmation.
4.  **Aesthetic:** Neon/Dark mode (Cyberpunk vibes) OR the proposed "Blue Sky" (Clean/High-Tech) theme.

## UI/UX Proposal: "Blue Sky" Theme (White Background)

Based on the gamified "Tap Trading" mechanics, the following "Blue Sky" theme is proposed to create a clean, trustworthy, and high-tech trading environment:

### 1. Strict Color Scheme (Do Not Deviate)
Use these exact HEX/RGB values. Do not interpolate between shades.

| Color Name | Hex | RGB | Usage |
| :--- | :--- | :--- | :--- |
| **Blue** | `#0000ff` | 0, 0, 255 | Primary Brand, Key Actions |
| **Cerulean** | `#3c8aff` | 60, 138, 255 | Secondary Brand, Highlights |
| **Gray 0** | `#ffffff` | 255, 255, 255 | Backgrounds, Cards |
| **Gray 10** | `#eef0f3` | 238, 240, 243 | Light Backgrounds, Tints |
| **Gray 15** | `#dee1e7` | 222, 225, 231 | Borders, Dividers |
| **Gray 30** | `#b1b7c3` | 177, 183, 195 | Disabled Text, Icons |
| **Gray 50** | `#717886` | 113, 120, 134 | Secondary Text |
| **Gray 60** | `#5b616e` | 91, 97, 110 | Body Text |
| **Gray 80** | `#32353d` | 50, 53, 61 | Headings |
| **Gray 100** | `#0a0b0d` | 10, 11, 13 | High Contrast Text |
| **Green** | `#66c800` | 102, 200, 0 | Success, Profit |
| **Lime Green**| `#b6f569` | 182, 245, 105 | Accents |
| **Red** | `#fc401f` | 252, 64, 31 | Error, Price Line Pop |
| **Pink** | `#fea8cd` | 254, 168, 205 | Soft Accents |
| **Tan** | `#b8a581` | 184, 165, 129 | Warn, Neutral Accents |
| **Yellow** | `#ffd12f` | 255, 209, 47 | Alerts, Stars |

### 2. Element Styling (Applied Palette)
- **The "Blocks" (Positions):**
  - *Pending/Idle:* **Gray 0** fill with **Blue** outline.
  - *Active/Selected:* Solid **Cerulean** fill (`#3c8aff`) with **Gray 0** text.
  - *Winning:* **Explosion Effect** using **Green** (`#66c800`) and **Lime Green** particles.

#### Block Content & Layout
Each grid block acts as a micro-interface and must display:
1.  **Bet Amount (Primary):**
    - **Position:** Top-Left or Center.
    - **Style:** **Gray 100** (Idle) / **Gray 0** (Active). Bold weight.
    - **Example:** "$5".
2.  **Multiplier (Secondary):**
    - **Position:** Bottom-Right.
    - **Style:** **Gray 60** (Idle) / **Gray 0** (Active). Medium weight, smaller size.
    - **Example:** "5.54x".
3.  **Winning State:**
    - Text dissolves into the **Green** particle explosion.
    - Replaced immediately by a floating **PnL Label** (+ $27.70) moving upward.
- **Price Line:** High-contrast **Blue** (`#0000ff`) or **Red** (`#fc401f`) to pop against **Gray 0** background.
- **Grid/Background:**
  - Background: **Gray 0** (`#ffffff`).
  - Grid Lines: **Gray 10** (`#eef0f3`) or **Gray 15** (`#dee1e7`).
- **Typography:**
  - Headings: **Gray 100** or **Gray 80**.
  - Body: **Gray 60**.
- **Shadows:** Soft shadows using **Gray 30** or **Gray 50** at low opacity.

### 3. Atmosphere
- **Vibe:** "Clean Fintech" meets "Arcade Precision". Think medical-grade UI cleanliness with fast, responsive game feedback.
- **Glassmorphism:** Use Frost White (`bg-white/80 backdrop-blur-md border-white/20`) for overlays and toasts.
