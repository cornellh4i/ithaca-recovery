import { PrismaClient } from '@prisma/client';
import { IMeeting, IRecurrencePattern } from "../../../../../util/models";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const retrieveDayMeetings = async (request: NextRequest) => {
    try {
        
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();

        let standardDate;
        if (dateParam.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateParam.split('-').map(Number);
            standardDate = new Date(year, month - 1, day);
        } else {
            standardDate = new Date(dateParam);
        }
        
        const startOfDay = new Date(standardDate);
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(standardDate);
        endOfDay.setHours(23, 59, 59, 999);
        
        const dayOfWeek = standardDate.getDay();
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        const requestedDayName = daysOfWeek[dayOfWeek];
        
        const regularMeetings = await prisma.meeting.findMany({
            where: {
                startDateTime: { gte: startOfDay },
                endDateTime: { lte: endOfDay },
                isRecurring: false
            }
        });
        
        const recurringMeetings = await prisma.meeting.findMany({
            where: { isRecurring: true },
            include: { recurrencePattern: true }
        });

        const applicableRecurringMeetings = recurringMeetings.filter(meeting => {
            const recurrence = meeting.recurrencePattern;
            if (!recurrence) return false;
            
            const isDayIncluded = recurrence.daysOfWeek && 
                                 recurrence.daysOfWeek.includes(requestedDayName);
            
            if (!isDayIncluded) return false;
            
            const patternStartDate = new Date(recurrence.startDate);
            if (standardDate < patternStartDate) return false;
            
            if (recurrence.endDate && standardDate > new Date(recurrence.endDate)) return false;
            
            if (recurrence.type === "weekly") {
                const msPerDay = 24 * 60 * 60 * 1000;
                const daysSinceStart = Math.floor(
                    (standardDate.getTime() - patternStartDate.getTime()) / msPerDay
                );
                
                const weeksSinceStart = Math.floor(daysSinceStart / 7);
                
                const isIntervalMatch = weeksSinceStart % recurrence.interval === 0;
                if (!isIntervalMatch) return false;
            }
            
            return true;
        });
        
        const adjustedRecurringMeetings = applicableRecurringMeetings.map(meeting => {
            const originalStart = new Date(meeting.startDateTime);
            const originalEnd = new Date(meeting.endDateTime);
            
            const adjustedStart = new Date(standardDate);
            adjustedStart.setHours(
                originalStart.getHours(),
                originalStart.getMinutes(),
                originalStart.getSeconds()
            );
            
            const adjustedEnd = new Date(standardDate);
            adjustedEnd.setHours(
                originalEnd.getHours(),
                originalEnd.getMinutes(),
                originalEnd.getSeconds()
            );
            
            return {
                ...meeting,
                startDateTime: adjustedStart,
                endDateTime: adjustedEnd,
            };
        });
        
        const allMeetings = [...regularMeetings, ...adjustedRecurringMeetings];
        
        const typedMeetings: IMeeting[] = allMeetings.map(meeting => {
            if ('recurrencePattern' in meeting) {
                const { recurrencePattern, ...meetingDetails } = meeting;
                return { ...meetingDetails, recurrencePattern };
            }
            // Regular meeting
            return { ...meeting };
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