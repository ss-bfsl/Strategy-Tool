#!/usr/bin/env python3
"""
Regenerates src/data/mockData.js from your monthly Excel workbook.

USAGE (from the project root):
    python scripts/generate_data.py
    python scripts/generate_data.py path/to/Industry_Data_.xlsx

What it does each run:
  1. Reads the "NSE active client data" sheet -> BROKER_LEADERBOARD
  2. Reads the "Broking data" sheet          -> INDUSTRY_PARAMS
  3. Reads the "MF & SIF Data" sheet         -> MF_SIF_DATA
  4. Overwrites src/data/mockData.js with fresh values.
  5. Leaves NEWS_ITEMS as a placeholder block (the News page now uses the
     live WebSocket feed, not this file, so it's untouched).

Just keep adding new month columns to the same workbook (same sheet names,
same layout) and re-run this after each month's data is added. No need to
touch mockData.js by hand.

Requirements: pip install pandas openpyxl --break-system-packages
"""

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_OUTPUT = PROJECT_ROOT / "src" / "data" / "mockData.js"


# ────────────────────────────── helpers ──────────────────────────────

def is_valid(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return False
    if isinstance(v, str) and v.strip() in ("-", "", "NA"):
        return False
    return True


def is_valid_nonzero(v):
    if not is_valid(v):
        return False
    if isinstance(v, (int, float)) and v == 0:
        return False
    return True


def to_num(v):
    if not is_valid(v):
        return None
    if isinstance(v, str):
        v = v.strip()
        try:
            return float(v)
        except ValueError:
            return None
    return float(v)


def to_percent(v):
    if not is_valid(v):
        return None
    if isinstance(v, str):
        text = v.strip().replace("%", "")
        try:
            number = float(text)
        except ValueError:
            return None
        return number
    number = float(v)
    return number * 100 if -1 <= number <= 1 else number


# ────────────────────────── broker leaderboard ──────────────────────────

def build_broker_leaderboard(xl):
    df = pd.read_excel(xl, sheet_name="NSE active client data", header=None)
    month_columns = []
    for column_index, value in enumerate(df.iloc[1, 1:], start=1):
        if isinstance(value, (int, float)) or not is_valid(value):
            break
        parsed_date = pd.to_datetime(value, errors="coerce")
        if pd.isna(parsed_date):
            break
        month_columns.append((column_index, parsed_date))

    if len(month_columns) < 2:
        raise ValueError("NSE active client data must contain at least two month columns")

    month_labels = [
        value.strftime("%b %Y") if hasattr(value, "strftime") else str(value)
        for _, value in month_columns
    ]
    data = df.iloc[2:].copy()
    market_share_column = month_columns[-1][0] + 2
    market_share_values = data.iloc[:, market_share_column].apply(to_percent)
    data = data.iloc[:, :len(month_columns) + 1]
    data.columns = ["broker", *[f"m{index + 1}" for index in range(len(month_columns))]]
    data["excelMarketShare"] = market_share_values.to_numpy()
    month_names = [f"m{index + 1}" for index in range(len(month_columns))]
    for month_name in month_names:
        data[month_name + "_num"] = data[month_name].apply(to_num)
    latest_name = month_names[-1]
    previous_name = month_names[-2]
    data["latest"] = data[latest_name + "_num"]
    data["prev"] = data[previous_name + "_num"]

    mask_total = data["broker"].astype(str).str.contains("Total", case=False, na=False)
    clean = data[~mask_total].copy()
    clean = clean[clean["latest"].notna() & (clean["latest"] > 0)]

    clean = clean.sort_values("latest", ascending=False).reset_index(drop=True)

    records = []
    for i, row in clean.iterrows():
        latest, prev = row["latest"], row["prev"]
        change = round((latest - prev) / prev * 100, 2) if prev and prev > 0 else 0
        name = re.sub(r"\s{2,}", " ", str(row["broker"]).strip())
        history = []
        for j, month_name in enumerate(month_names):
            v = row[month_name + "_num"]
            if v is not None and v > 0:
                history.append({"month": month_labels[j], "value": int(v)})
        records.append({
            "rank": i + 1,
            "broker": name,
            "activeClients": int(latest),
            "marketShare": round(row["excelMarketShare"], 2) if row["excelMarketShare"] is not None else None,
            "change": change,
            "history": history,
        })
    return records


# ────────────────────────── industry params ──────────────────────────

SOURCE_URL_MAP = {
    "NSE/ Sebi bulletin": "https://www.nseindia.com",
    "SEBI bulletin": "https://www.sebi.gov.in",
    "NSE Pulse": "https://www.nseindia.com/research/publications-reports-nse-pulse",
}


def categorize(param, cat_col):
    p = param.lower()
    if "trading days" in p:
        return "Market Calendar"
    if "demat" in p:
        return "Demat Accounts"
    if "active clients" in p or "unique pans" in p:
        return "Active Clients"
    if p.startswith("fii") or p.startswith("dii"):
        return "FII/DII Flows"
    if cat_col == "M cap wise":
        return "Market Cap by Investor Type"
    if cat_col == "Overall":
        return "Market Turnover"
    if "mtf" in p:
        return "Margin Trading (MTF)"
    if cat_col == "Take from Amit":
        return "Retail ADTO"
    return "Other"


def source_url(source):
    if not source:
        return "https://www.nseindia.com"
    if isinstance(source, str) and "bseindia" in source:
        m = re.search(r"(https?://\S+)", source)
        return m.group(1) if m else "https://www.bseindia.com"
    if isinstance(source, str) and "nseindia" in source:
        m = re.search(r"(https?://\S+)", source)
        return m.group(1).rstrip(")") if m else "https://www.nseindia.com"
    return SOURCE_URL_MAP.get(source, "https://www.nseindia.com")


def source_label(source):
    if not source:
        return "Internal calc."
    if isinstance(source, str) and "bseindia" in source:
        return "BSE"
    if isinstance(source, str) and "nseindia" in source:
        return "NSE"
    return source


def fmt_value(param, val):
    if val is None:
        return None
    p = param.lower()
    if any(k in p for k in ["volume", "mtf", "adto"]):
        return f"₹{val:,.0f} Cr"
    if "lakh crore" in p:
        return f"₹{val:,.1f} Lakh Cr"
    if "(in cr)" in p or "(incr)" in p:
        return f"{val:,.2f} Cr"
    if isinstance(val, float) and val == int(val):
        return f"{int(val):,}"
    return f"{val:,.2f}"


def build_industry_params(xl):
    df = pd.read_excel(xl, sheet_name="Broking data", header=None)
    dates = [d.strftime("%b %Y") if hasattr(d, "strftime") else d
             for d in df.iloc[0, 3:].tolist()]

    records = []
    for i in range(1, df.shape[0]):
        row = df.iloc[i]
        param = row[0]
        if pd.isna(param) or (isinstance(param, str) and param.startswith("Src:")):
            continue
        cat_col = row[1] if not pd.isna(row[1]) else None
        source = row[2] if not pd.isna(row[2]) else None
        values = row[3:].tolist()
        idxs = [j for j, v in enumerate(values) if is_valid_nonzero(v)]
        if not idxs:
            continue
        last_idx = idxs[-1]
        prev_idx = idxs[-2] if len(idxs) >= 2 else None
        last_val = float(values[last_idx])
        prev_val = float(values[prev_idx]) if prev_idx is not None else None
        change = round((last_val - prev_val) / abs(prev_val) * 100, 1) if prev_val else 0
        clean_param = re.sub(r"\s*\(In\s?Cr\)|\s*\(lakh Crore\)|\s*\(Lk Cr\)", "",
                              str(param), flags=re.I).strip()
        clean_param = re.sub(r"\s{2,}", " ", clean_param)
        history = [{"month": dates[j], "value": float(values[j])} for j in idxs]
        records.append({
            "category": categorize(str(param), cat_col),
            "param": clean_param,
            "value": fmt_value(str(param), last_val),
            "prevValue": fmt_value(str(param), prev_val) if prev_val is not None else "—",
            "change": change,
            "source": source_label(source),
            "sourceUrl": source_url(source),
            "asOf": dates[last_idx],
            "history": history,
        })
    return records


# ────────────────────────── MF & SIF data ──────────────────────────

MF_FIELDS = [
    ("Total AUM", "Total AUM (Lk Cr)", lambda v: f"₹{v:,.2f} Lakh Cr"),
    ("Equity AUM", "Equity AUM (Lk Cr)", lambda v: f"₹{v:,.2f} Lakh Cr"),
    ("MF Schemes", "MF Schemes", lambda v: f"{int(v):,}"),
    ("MF Folios", "MF Folios (Lk Cr)", lambda v: f"{v:,.2f} Cr"),
    ("SIP Accounts", "SIP Accounts", lambda v: f"{v/100:,.2f} Cr"),
    ("SIP Monthly Inflow", "SIP Flows", lambda v: f"₹{v:,.0f} Cr"),
    ("SIP AUM", "SIP AUM", lambda v: f"₹{v/100000:,.2f} Lakh Cr"),
    ("SIF AUM", "SIF AUM", lambda v: f"₹{v:,.0f} Cr"),
    ("SIF Folios", "SIF Folios", lambda v: f"{int(v):,}"),
    ("SIF Schemes", "SIF Schemes", lambda v: f"{int(v):,}"),
    ("B30 Contribution", "B30 contribution (Lk Cr)", lambda v: f"₹{v:,.2f} Lakh Cr"),
    ("T30 Contribution", "T30 contribution  (Lk Cr)", lambda v: f"₹{v:,.2f} Lakh Cr"),
]


def build_mf_sif(xl):
    df = pd.read_excel(xl, sheet_name="MF & SIF Data", header=None)
    dates = df.iloc[0, 2:].tolist()
    month_labels = [d.strftime("%b %Y") if hasattr(d, "strftime") else str(d) for d in dates]

    def get_series(param):
        row = df[df[0] == param]
        if row.empty:
            return []
        vals = row.iloc[0, 2:].tolist()
        return [(j, float(v)) for j, v in enumerate(vals) if is_valid(v)]

    def pct(last, prev):
        if last is None or prev is None or prev == 0:
            return 0
        return round((last - prev) / abs(prev) * 100, 1)

    headline = []
    for label, param, fmt in MF_FIELDS:
        series = get_series(param)
        if not series:
            continue
        last_idx, last_val = series[-1]
        prev_val = series[-2][1] if len(series) >= 2 else None
        history = [{"month": month_labels[j], "value": v} for j, v in series]
        headline.append({
            "label": label,
            "value": fmt(last_val),
            "change": pct(last_val, prev_val),
            "history": history,
        })

    return {"headline": headline}


# ────────────────────────── company competition data ──────────────────────────

COMPANY_COLUMNS = [
    ("Groww", 2, "tech"),
    ("Angel One", 3, "tech"),
    ("Zerodha", 4, "tech"),
    ("Bajaj Broking", 5, "tech"),
    ("Motilal", 8, "traditional"),
    ("ICICI Sec", 9, "traditional"),
    ("HDFC Sec", 10, "traditional"),
    ("Kotak Sec", 11, "traditional"),
]


def competition_period(sheet_name, df):
    pattern = re.compile(r"FY\s*'?\s*(\d{2})(?:\s*H\s*([12]))?", re.I)
    for value in [sheet_name, *df.iloc[:4, :4].to_numpy().ravel().tolist()]:
        if not isinstance(value, str):
            continue
        match = pattern.search(value.strip())
        if match:
            return f"FY{match.group(1)}H{match.group(2)}" if match.group(2) else f"FY{match.group(1)}"
    return None


def competition_number(value):
    if not is_valid(value):
        return None
    return to_num(value)


def build_competition_data(xl):
    """Read competition comparison tabs, including the workbook's historical 'Competiton' spelling."""
    output = []
    known_labels = {"total revenue", "pat", "roe", "mtf book", "networth", "avg networth"}

    for sheet_name in xl.sheet_names:
        normalized_name = re.sub(r"[^a-z]", "", sheet_name.lower())
        candidate_name = normalized_name.startswith("competition") or normalized_name.startswith("competiton")
        period_match = re.search(r"fy\s*'?\s*\d{2}(?:\s*h\s*[12])?", sheet_name, re.I)
        if not candidate_name and not period_match:
            continue

        df = pd.read_excel(xl, sheet_name=sheet_name, header=None, dtype=object)
        labels = {
            re.sub(r"\s+", " ", str(value)).strip().lower()
            for value in df.to_numpy().ravel()
            if isinstance(value, str) and value.strip()
        }
        if not candidate_name and len(labels & known_labels) < 3:
            continue

        period = competition_period(sheet_name, df)
        if not period:
            continue

        companies = [{
            "name": name,
            "group": "Tech Driven Brokers" if group == "tech" else "Traditional Brokers",
        } for name, _, group in COMPANY_COLUMNS]
        header_rows = []
        for row_index in range(min(24, df.shape[0])):
            matches = sum(
                1 for name, column, _ in COMPANY_COLUMNS
                if column < df.shape[1]
                and isinstance(df.iat[row_index, column], str)
                and df.iat[row_index, column].strip().lower() == name.lower()
            )
            if matches >= 4:
                header_rows.append(row_index)
        if not header_rows:
            continue
        financial_header = header_rows[0]
        revenue_header = header_rows[1] if len(header_rows) > 1 else None
        metrics = []
        financial_end = revenue_header if revenue_header is not None else df.shape[0]
        for data_index in range(financial_header + 1, financial_end):
            left_label = df.iat[data_index, 1] if df.shape[1] > 1 else None
            label = str(left_label).strip() if isinstance(left_label, str) and left_label.strip() else str(df.iat[data_index, 0]).strip() if isinstance(df.iat[data_index, 0], str) else ""
            if not label or label.lower() in {"revenue mix", "na", "-"}:
                continue
            values = {name: competition_number(df.iat[data_index, col]) if col < df.shape[1] else None for name, col, _ in COMPANY_COLUMNS}
            if any(value is not None for value in values.values()):
                metrics.append({
                    "label": re.sub(r"\s+", " ", label),
                    "format": "percent" if "roe" in label.lower() else "currency" if label.lower() in {"total revenue", "pat", "opening networth", "closing net worth", "avg networth", "mtf book", "networth"} else "number",
                    "values": values,
                })

        if not metrics:
            continue

        revenue_mix = []
        # The left and right halves of the worksheet may use different labels for the same row.
        # Preserve each side's label, while borrowing the row's left label when the right label is blank.
        header_row = revenue_header
        if header_row is not None:
            for row_index in range(header_row + 1, df.shape[0]):
                left_raw = df.iat[row_index, 1] if df.shape[1] > 1 else None
                right_raw = df.iat[row_index, 7] if df.shape[1] > 7 else None
                left_label = str(left_raw).strip() if isinstance(left_raw, str) and left_raw.strip().lower() not in {"na", "-"} else ""
                right_label = str(right_raw).strip() if isinstance(right_raw, str) and right_raw.strip().lower() not in {"na", "-"} else ""
                left_values = {name: competition_number(df.iat[row_index, col]) if col < df.shape[1] else None for name, col, group in COMPANY_COLUMNS if group == "tech"}
                right_values = {name: competition_number(df.iat[row_index, col]) if col < df.shape[1] else None for name, col, group in COMPANY_COLUMNS if group == "traditional"}
                if not any(value is not None for value in [*left_values.values(), *right_values.values()]):
                    continue
                if not left_label and any(value is not None for value in left_values.values()):
                    left_label = "Other / not specified"
                if not right_label and any(value is not None for value in right_values.values()) and not left_label:
                    right_label = "Other / not specified"
                if not left_label and not right_label:
                    left_label = "Other / not specified"
                if left_label and (not right_label or left_label.lower() == right_label.lower()):
                    revenue_mix.append({"label": left_label, "format": "percent", "values": {**left_values, **right_values}})
                elif right_label and not left_label:
                    revenue_mix.append({"label": right_label, "format": "percent", "values": {**left_values, **right_values}})
                else:
                    if left_label:
                        revenue_mix.append({"label": left_label, "format": "percent", "values": left_values})
                    if right_label:
                        revenue_mix.append({"label": right_label, "format": "percent", "values": right_values})

        output.append({
            "id": period,
            "label": period,
            "groups": [
                {"label": "Tech Driven Brokers", "companies": [name for name, _, group in COMPANY_COLUMNS if group == "tech"]},
                {"label": "Traditional Brokers", "companies": [name for name, _, group in COMPANY_COLUMNS if group == "traditional"]},
            ],
            "financials": metrics,
            "revenueMix": revenue_mix,
        })

    unique_periods = {item["id"]: item for item in output}
    return {"periods": list(unique_periods.values())}


# ────────────────────────── JS output ──────────────────────────

def to_js(obj):
    import json
    return json.dumps(obj, ensure_ascii=False, indent=2)


NEWS_PLACEHOLDER = """export const NEWS_ITEMS = [
  {
    id: 1,
    title: 'Groww launches zero-fee F&O plan for high-frequency traders',
    company: 'Groww',
    tag: 'Product Launch',
    date: '2026-09-04',
    summary: 'New pricing tier targets active F&O traders with flat monthly fee instead of per-order brokerage.',
    sourceUrl: 'https://www.google.com/search?q=groww+zero+fee+f%26o+plan',
  },
  {
    id: 2,
    title: 'Angel One rolls out AI-based portfolio advisory inside its app',
    company: 'Angel One',
    tag: 'Product Launch',
    date: '2026-09-02',
    summary: 'Feature suggests rebalancing actions based on user risk profile and holding concentration.',
    sourceUrl: 'https://www.google.com/search?q=angel+one+ai+portfolio+advisory',
  },
];
// ^ Unused by the News page (that now uses the live WebSocket feed via
// server/main.py) — still exported here only for the small Dashboard preview
// card. Safe to leave as-is or update by hand."""


def write_mock_data(output_path, brokers, industry, mf_sif):
    content = f"""// AUTO-GENERATED by scripts/generate_data.py — do not hand-edit the
// BROKER_LEADERBOARD / INDUSTRY_PARAMS / MF_SIF_DATA sections below, they
// will be overwritten next time the script runs. Update the source Excel
// workbook and re-run the script instead.
//
// Regenerate with:
//   python scripts/generate_data.py path/to/Industry_Data_.xlsx

export const BROKER_LEADERBOARD = {to_js(brokers)};

export const INDUSTRY_PARAMS = {to_js(industry)};

{NEWS_PLACEHOLDER}

export const MF_SIF_DATA = {to_js(mf_sif)};
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")


def write_competition_data(output_path, competition):
    competition_path = output_path.parent / "competitionData.js"
    competition_path.write_text(
        f"// AUTO-GENERATED by scripts/generate_data.py from Competition workbook tabs.\n"
        f"export const COMPETITION_DATA = {to_js(competition)};\n",
        encoding="utf-8",
    )


# ────────────────────────── main ──────────────────────────

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "excel_path",
        nargs="?",
        help="Path to the monthly Industry_Data_.xlsx workbook; defaults to the only .xlsx file in the project root",
    )
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT),
                         help=f"Where to write mockData.js (default: {DEFAULT_OUTPUT})")
    args = parser.parse_args()

    if args.excel_path:
        excel_path = Path(args.excel_path)
    else:
        workbooks = sorted(PROJECT_ROOT.glob("*.xlsx"))
        if len(workbooks) != 1:
            if not workbooks:
                print(f"[ERROR] No .xlsx workbook found in {PROJECT_ROOT}", file=sys.stderr)
            else:
                print("[ERROR] More than one .xlsx workbook found. Pass the file path explicitly:", file=sys.stderr)
                for workbook in workbooks:
                    print(f"        {workbook}", file=sys.stderr)
            sys.exit(1)
        excel_path = workbooks[0]

    if not excel_path.exists():
        print(f"[ERROR] File not found: {excel_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[1/4] Reading {excel_path.name} ...")
    xl = pd.ExcelFile(excel_path)

    print("[2/4] Building broker leaderboard ...")
    brokers = build_broker_leaderboard(xl)
    print(f"       -> {len(brokers)} brokers")

    print("[3/4] Building industry params ...")
    industry = build_industry_params(xl)
    print(f"       -> {len(industry)} parameters")

    print("[4/4] Building MF & SIF data ...")
    mf_sif = build_mf_sif(xl)
    print(f"       -> {len(mf_sif['headline'])} headline stats, each with full history")

    print("[5/5] Building competition comparisons ...")
    competition = build_competition_data(xl)
    print(f"       -> {len(competition['periods'])} fiscal period(s)")

    output_path = Path(args.output)
    write_mock_data(output_path, brokers, industry, mf_sif)
    write_competition_data(output_path, competition)
    print(f"\n[OK] Wrote {output_path}")
    print("Refresh your browser (the dev server will hot-reload automatically).")


if __name__ == "__main__":
    main()
