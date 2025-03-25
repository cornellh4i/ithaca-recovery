import { PrismaClient } from "@prisma/client";
import { getEvents } from "../../microsoft/events/route";
import { fetchMeetings } from "../../retrieve/meeting/route";
import { fetchGroups } from "../../microsoft/groups/route";
import { fetchCalendars } from "../../microsoft/calendars/getCalendars/route";

const compareMeetings = async() => {
    try {
        console.log("Starting compareMeetings function...");
        
        console.log("Attempting to fetch groups...");
        const groupsResponse = await fetchGroups();
        console.log("Groups response received:", groupsResponse ? "success" : "failed");
        
        if (!groupsResponse) {
            return { 
                error: "Failed to fetch groups",
                details: "The fetchGroups function returned null or undefined. This could be due to authentication issues with Microsoft Graph API or network connectivity problems."
            };
        }
        
        let groups;
        try {
            groups = await groupsResponse.json();
            console.log("Groups data parsed:", groups ? "success" : "failed");
            console.log("Groups data:", groups);
        } catch (jsonError) {
            console.error("Error parsing groups JSON:", jsonError);
            return {
                error: "Failed to parse groups response",
                details: `Error parsing JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`,
                responseType: typeof groupsResponse
            };
        }

        if (!groups?.value?.length) {
            console.error("No groups found in the response");
            return { 
                error: "No groups found in the response", 
                details: "The API returned a successful response but no groups were found",
                groupsData: groups 
            };
        }

        const groupId = groups.value[0].id;
        console.log("Using group ID:", groupId);
        
        console.log("Attempting to fetch calendar for group:", groupId);
        const calendarResponse = await fetchCalendars(groupId);
        console.log("Calendar response received:", calendarResponse ? "success" : "failed");
        
        if (!calendarResponse) {
            return { 
                error: "Failed to fetch calendar", 
                details: "The fetchCalendars function returned null or undefined"
            };
        }
        
        let calendarData;
        try {
            calendarData = await calendarResponse.json();
            console.log("Calendar data parsed:", calendarData ? "success" : "failed");
            console.log("Calendar data:", calendarData);
        } catch (jsonError) {
            return {
                error: "Failed to parse calendar response",
                details: `Error parsing JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`
            };
        }

        console.log("Attempting to fetch events for group:", groupId);
        const eventsResponse = await getEvents(groupId);
        console.log("Events response received:", eventsResponse ? "success" : "failed");
        
        if (!eventsResponse) {
            return { 
                error: "Failed to fetch events", 
                details: "The getEvents function returned null or undefined" 
            };
        }
        
        console.log("Events response type:", typeof eventsResponse);
        console.log("Events response structure:", Object.keys(eventsResponse));
        
        const eventsData = eventsResponse.value || [];
        console.log("Number of events:", eventsData ? eventsData.length : 0);
        console.log("Events data:", eventsData);

        console.log("Attempting to fetch MongoDB meetings...");
        const meetingResponse = await fetchMeetings();
        console.log("MongoDB meetings received:", meetingResponse ? "success" : "failed");
        console.log("MongoDB meetings:", meetingResponse);

        return {
            success: true,
            groups: groups,
            calendar: calendarData,
            events: eventsData,
            mongoMeetings: meetingResponse
        };
    } catch (error) {
        console.error("Error comparing meetings: ", error);
        console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
        return { 
            error: "Error comparing meetings", 
            details: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        };
    }
}

export { compareMeetings }