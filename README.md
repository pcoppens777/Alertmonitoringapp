# TradingView Alert Monitor (V3)

## Project Overview
This application is a real-time monitoring dashboard for TradingView Webhook alerts. It captures incoming POST requests from TradingView, parses the data, saves it to a local SQLite database, and broadcasts it to the frontend using WebSockets.

## Original Requirements & Context
The goal was to build a robust system that:
1.  **Receives Webhooks:** Listens on `/api/webhook` for TradingView alerts.
2.  **Parses Data:** Supports both JSON and Pipe-delimited (`SYMBOL|CAT|MSG|PRICE`) formats.
3.  **Real-time Updates:** Uses Socket.io to push new alerts to the dashboard without refreshing.
4.  **Visual Analysis:** Integrates the TradingView Lightweight Charts/Widget to view the asset currently being alerted.
5.  **Debuggability:** Includes a "Deep Trace Logger" to capture every request hitting the server to troubleshoot connectivity issues (especially useful for TradingView's sometimes opaque webhook behavior).

## Technical Stack
- **Frontend:** React (TypeScript), Tailwind CSS, Lucide Icons, Motion (Framer Motion).
- **Backend:** Node.js with Express.
- **Real-time:** Socket.io.
- **Database:** SQLite (via `better-sqlite3`) for alerts, traffic logs, and debug traces.
- **Build Tool:** Vite.

## How to Use
1.  **Webhook URL:** Use the **Shared App URL** (found in the dashboard UI) followed by `/api/webhook`.
2.  **TradingView Setup:** Set the Webhook URL in your TradingView alert settings. Ensure the method is POST.
3.  **Monitoring:** Open the dashboard. New alerts will pop up in the sidebar.
4.  **Debugging:** If alerts aren't appearing, click the **Activity (Pulse)** icon in the sidebar to open the **System Debug Monitor**. This shows every single request hitting the server, helping you identify if TradingView is reaching the app or if it's hitting the wrong path.

## Important Note for Transfer
When importing this project into a new AI Studio environment:
- The **Shared App URL will change**. You must update your TradingView alerts with the new URL provided in the dashboard.
- The `alerts.db` file contains the current history.
- The server runs on Port 3000.


 User

    I got a paid TradingView account.

    I put on alarms on different assets.

    What I now have to do is, if the alarm goes off, I have to go to TradingView and look where the alarm went off and go through the charts one by one to see what i have drawn on the chart.

    The alarms are coming in my gmail saying that alarm went of on that specific asset.

    the assets that iam watching are on a specific layout and i draw swing point lines and FVGs on these charts, i got a little strategy

    i have these assets organized in a list name cyclical portfolio and then i have them structures in indexes-structural - cyclical -research -relatives like in the attached screenshot in tradingview

    what i want is an app/dashboard that monitors the alarms and that give me an overview of all the alarms that went off with a screenshot of the asset and the drawing that i put on it. so i don't have to go see immediately. Would be nice to have them organized in categories like structural - cyclical .....
    Keep it as simple as possible . But with a professional look.