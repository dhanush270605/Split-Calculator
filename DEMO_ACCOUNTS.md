# Demo accounts (LOCAL DEVELOPMENT ONLY)

Created by `npm run seed`. These credentials are public in this repository, so never use them on a real deployment.

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@1234` |
| User | `dhanush` (User 1) | `Demo@1234` |
| Users | `aarav`, `meera`, `karthik`, `priya`, `rohan`, `sneha`, `vikram`, `ananya`, `rahul` | `Demo@1234` |

## Demo events
1. **Munnar Weekend Trip** (Trip, completed). 6 people, 4 approved expenses (equal + percentage), settlements: 3 confirmed + 1 partial payment awaiting confirmation.
2. **SIH Grand Finale - IIT Madras** (Hackathon, upcoming). 5 people, full hackathon details, a college-paid registration, a train expense, a train travel segment.
3. **Kerala IIT Hackathon + Trip** (Hackathon + Trip, active). All 10 people, itinerary, 3 travel segments, budget, checklist, 13 expenses covering: college-sponsored (₹3,000 lunch), organizer-paid, shares / percentage / equal splits, cash + UPI + card, personal, **private** (medical; surprise gift with a private reason), pending approval, approved, **declined** (breakfast), **disputed** (snacks), a group-member payer awaiting confirmation, and a part-paid settlement. Admin has an announcement + an open problem report.

Things to try: sign in as `rahul` and check that he can see his private medicine expense, but `meera` cannot. Sign in as `admin` and see both. As `meera`, open Breakfast (declined) and note that it creates no debt for her.
