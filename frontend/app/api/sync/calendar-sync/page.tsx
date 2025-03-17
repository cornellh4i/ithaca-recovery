import { PrismaClient } from "@prisma/client";
import { getEvents } from "../../microsoft/events/route";
import { fetchMeetings } from "../../retrieve/meeting/route";
import { fetchGroups } from "../../microsoft/groups/route";
import { fetchCalendars } from "../../microsoft/calendars/getCalendars/route";
import { group } from "console";

const compareMeetings = async() => {
    try {
        const groupsResponse = await fetchGroups();
        const groups = await groupsResponse?.json()
        console.log(groups);

        const groupId = groups.value[0].id;
        const calendarResponse = await fetchCalendars(groupId);
        const calendarData = await calendarResponse.json();

        const eventsResponse = await getEvents(groupId);
        const eventsData = await eventsResponse.json();

        console.log("ID:", groupId);
        console.log("Calendar:", calendarData);
        console.log("Events:", eventsData);

        const meetingResponse = await fetchMeetings();
        // console.log("Mongo Meetings:", meetingResponse);

    } catch (error) {
        console.error("Error comparing meetings: ", error);
        return new Response(JSON.stringify({ error: "Error comparing meetings" }), {
        status: 500,
        headers: {
            'Content-Type': 'application/json',
        },
        });
    }
}

export { compareMeetings }