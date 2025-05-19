export const dynamic = 'force-dynamic';

import { PrismaClient } from '@prisma/client';
import { IMeeting, IRecurrencePattern } from "../../../../../util/models";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();

        let localDate : Date;
        if (dateParam.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateParam.split('-').map(Number);
            localDate = new Date(Date.UTC(year, month - 1, day));
        } else {
            localDate = new Date(dateParam);
        }
        
        const startOfDay = new Date(Date.UTC(
            localDate.getUTCFullYear(),
            localDate.getUTCMonth(),
            localDate.getUTCDate(),
            4, 0, 0, 0 //this is 12:00am in EST
        ));
        
        const endOfDay = new Date(Date.UTC(
            localDate.getUTCFullYear(),
            localDate.getUTCMonth(),
            localDate.getUTCDate()+1,
            // 23, 59, 59, 999
            3, 59, 59, 999 // this is 11:59pm in EST
        ));

        const dayOfWeek = localDate.getUTCDay();
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const requestedDayName = daysOfWeek[dayOfWeek];
        
        const directlyScheduledMeetings = await prisma.meeting.findMany({
            where: {
                startDateTime: { lte: endOfDay },
                endDateTime: { gte: startOfDay }
            },
            include: { 
                recurrencePattern: true 
            }
        });
        
        const regularMeetings = directlyScheduledMeetings.filter(meeting => !meeting.isRecurring);
        const originalDayRecurringMeetings = directlyScheduledMeetings.filter(meeting => meeting.isRecurring);
        
        const otherRecurringMeetings = await prisma.meeting.findMany({
            where: { 
                isRecurring: true,
                NOT: {
                    AND: [
                        { startDateTime: { gte: startOfDay } },
                        { endDateTime: { lte: endOfDay } }
                    ]
                }
            },
            include: { recurrencePattern: true }
        });
        
        const patternDayMeetings = otherRecurringMeetings.filter(meeting => {
            const recurrence = meeting.recurrencePattern;
            if (!recurrence) return false;
            
            const isDayIncluded = recurrence.daysOfWeek && 
                                recurrence.daysOfWeek.includes(requestedDayName);
            
            if (!isDayIncluded) return false;
            
            const patternStartDate = new Date(recurrence.startDate);
            if (localDate < patternStartDate) return false;
            
            if (recurrence.endDate && localDate > new Date(recurrence.endDate)) return false;
            
            if (recurrence.type === "weekly") {
                // Get the day of week of the pattern start date (0-6)
                const startDayOfWeek = patternStartDate.getUTCDay();
                
                // Calculate the start of the week containing the pattern start date
                const patternStartWeekStart = new Date(patternStartDate);
                patternStartWeekStart.setUTCDate(patternStartDate.getUTCDate() - startDayOfWeek);
                patternStartWeekStart.setUTCHours(0, 0, 0, 0);
                
                // Calculate the start of the week containing the requested date
                const requestedDateWeekStart = new Date(localDate);
                requestedDateWeekStart.setUTCDate(localDate.getUTCDate() - dayOfWeek);
                requestedDateWeekStart.setUTCHours(0, 0, 0, 0);
                
                // Calculate complete weeks between the start week and the requested week
                const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                const weeksBetween = Math.round(
                    (requestedDateWeekStart.getTime() - patternStartWeekStart.getTime()) / msPerWeek
                );
                
                // Check if the number of weeks matches the interval pattern
                const isIntervalMatch = weeksBetween % recurrence.interval === 0;
                if (!isIntervalMatch) return false;
            }
            
            return true;
        });
        
        const adjustedPatternMeetings = patternDayMeetings.map(meeting => {
            const originalStart = new Date(meeting.startDateTime);
            const originalEnd = new Date(meeting.endDateTime);
            
            const adjustedStart = new Date(Date.UTC(
                localDate.getUTCFullYear(),
                localDate.getUTCMonth(),
                localDate.getUTCDate(),
                originalStart.getUTCHours(),
                originalStart.getUTCMinutes(),
                originalStart.getUTCSeconds()
            ));
            
            const adjustedEnd = new Date(Date.UTC(
                localDate.getUTCFullYear(),
                localDate.getUTCMonth(),
                localDate.getUTCDate(),
                originalEnd.getUTCHours(),
                originalEnd.getUTCMinutes(),
                originalEnd.getUTCSeconds()
            ));
            
            return {
                ...meeting,
                startDateTime: adjustedStart,
                endDateTime: adjustedEnd,
            };
        });
        
        const allMeetings = [
            ...regularMeetings, 
            ...originalDayRecurringMeetings,
            ...adjustedPatternMeetings
        ];
        
        const typedMeetings: IMeeting[] = allMeetings.map((meeting) => {
            const { recurrencePattern, ...meetingDetails } = meeting;
          
            return {
              ...meetingDetails,
              recurrencePattern: recurrencePattern ?? null,
            };
          });          
        
        return new Response(JSON.stringify(typedMeetings), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
            },
        });

    } catch (error) {
        console.error("Error retrieving meetings: ", error);
        return new Response(JSON.stringify({ error: "Error retrieving meetings" }), {
            status: 500,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
};

export { retrieveDayMeetings as GET };