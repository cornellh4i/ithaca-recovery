import { NextRequest } from "next/server";
import { seedMeeting } from "../factories/meeting";
import { disconnectTestPrismaClient } from "../factories/db";
import { GET } from "../../app/api/retrieve/meeting/range/route";
import { addDaysToETDateString, convertETToUTC, formatETDateString } from "../../util/date/timeUtils";
import { getMonthGridRange, MONTH_GRID_DAYS } from "../../util/meetings/monthGrid";

afterAll(async () => {
  await disconnectTestPrismaClient();
});

async function getRange(startDate: string, endDate: string) {
  const request = new NextRequest(
    `http://localhost/api/retrieve/meeting/range?startDate=${startDate}&endDate=${endDate}`,
  );
  const response = await GET(request);
  return { status: response.status, body: await response.json() };
}

// The desktop Month view (GitHub #459) fetches its whole 6-week grid in one request, so the
// route's cap has to cover exactly that window -- and still reject anything wider.
test("accepts a 42-day span (a full month grid)", async () => {
  const start = formatETDateString(new Date());
  const end = addDaysToETDateString(start, MONTH_GRID_DAYS - 1);

  const { status, body } = await getRange(start, end);
  expect(status).toBe(200);
  expect(Array.isArray(body)).toBe(true);
});

test("rejects a 43-day span with the cap in the error copy", async () => {
  const start = formatETDateString(new Date());
  const end = addDaysToETDateString(start, MONTH_GRID_DAYS);

  const { status, body } = await getRange(start, end);
  expect(status).toBe(400);
  expect(body.error).toBe("Range must not exceed 42 days");
});

test("returns meetings on the adjacent-month padding days of a month grid", async () => {
  // Pick the grid for a month ~2 months out, so the seeded meeting can't collide with any
  // other spec's "today" data, and seed onto its very last cell -- always the following month,
  // since at most 6 leading cells + 31 days still leaves the 42nd cell past the month's end.
  // (The first cell isn't always padding: a month whose 1st is a Sunday starts on the 1st.)
  const anchor = new Date(convertETToUTC(`${addDaysToETDateString(formatETDateString(new Date()), 60)}T12:00:00`));
  const grid = getMonthGridRange(anchor);
  const paddingDay = grid.endDate;
  expect(paddingDay.slice(0, 7)).not.toBe(grid.monthKey);
  const meeting = await seedMeeting({
    title: "Month Grid Padding Meeting",
    startDateTime: new Date(convertETToUTC(`${paddingDay}T18:00:00`)),
    endDateTime: new Date(convertETToUTC(`${paddingDay}T19:00:00`)),
  });

  const { status, body } = await getRange(grid.startDate, grid.endDate);
  expect(status).toBe(200);
  const own = (body as { mid: string; date: string }[]).filter(r => r.mid === meeting.mid);
  expect(own.map(r => r.date)).toEqual([paddingDay]);
});
