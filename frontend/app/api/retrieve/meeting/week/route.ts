export const dynamic = 'force-dynamic';

import { PrismaClient } from '@prisma/client';
import { IMeeting } from "../../../../../util/models";
import { NextRequest } from 'next/server';

const prisma = new PrismaClient();

const retrieveWeekMeetings = async (request: NextRequest) => {
    try {
        const dateParam = request.nextUrl.searchParams.get("startDate") ?? new Date().toISOString();
        
        // Parse the date parameter
        let standardDate: Date;
        if (dateParam.match(/^\d{4}-\d{2}-\d{2}$/)) {
            const [year, month, day] = dateParam.split('-').map(Number);
            standardDate = new Date(Date.UTC(year, month - 1, day));
        } else {
            standardDate = new Date(dateParam);
        }
        
        // Calculate start and end of the week
        const startOfWeek = new Date(Date.UTC(
            standardDate.getUTCFullYear(), 
            standardDate.getUTCMonth(), 
            standardDate.getUTCDate() - standardDate.getUTCDay()
        ));
        
        const endOfWeek = new Date(Date.UTC(
            standardDate.getUTCFullYear(), 
            standardDate.getUTCMonth(), 
            standardDate.getUTCDate() + (6 - standardDate.getUTCDay()), 
            23, 59, 59, 999
        ));
        
        // Get directly scheduled meetings (both regular and recurring)
        const directlyScheduledMeetings = await prisma.meeting.findMany({
            where: {
                startDateTime: { gte: startOfWeek },
                endDateTime: { lte: endOfWeek }
            },
            include: { 
                recurrencePattern: true 
            }
        });
        
        // Filter regular meetings and original recurring meetings
        const regularMeetings = directlyScheduledMeetings.filter(meeting => !meeting.isRecurring);
        const originalWeekRecurringMeetings = directlyScheduledMeetings.filter(meeting => meeting.isRecurring);
        
        // Get other recurring meetings that might apply to this week
        const otherRecurringMeetings = await prisma.meeting.findMany({
            where: { 
                isRecurring: true,
                NOT: {
                    AND: [
                        { startDateTime: { gte: startOfWeek } },
                        { endDateTime: { lte: endOfWeek } }
                    ]
                }
            },
            include: { recurrencePattern: true }
        });
        
        // Array to store all days of the week
        const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        
        // Process each day of the week
        let allWeekMeetings = [...regularMeetings];
        const filteredOriginals = [];
        
        // Filter original recurring meetings to exclude those on excluded dates
        for (const meeting of originalWeekRecurringMeetings) {
            const recurrence = meeting.recurrencePattern;
            if (!recurrence) {
                filteredOriginals.push(meeting);
                continue;
            }
            
            const meetingDate = new Date(meeting.startDateTime);
            const isExcluded = recurrence.excludedDates?.some(date => 
                new Date(date).toISOString().slice(0, 10) === meetingDate.toISOString().slice(0, 10)
            );
            
            if (!isExcluded) {
                filteredOriginals.push(meeting);
            }
        }
        
        allWeekMeetings = [...allWeekMeetings, ...filteredOriginals];
        
        // Process each day of the requested week
        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(startOfWeek);
            currentDay.setUTCDate(startOfWeek.getUTCDate() + i);
            
            const dayName = daysOfWeek[i];
            
            // Filter recurring meetings that apply to this day
            const patternDayMeetings = otherRecurringMeetings.filter(meeting => {
                const recurrence = meeting.recurrencePattern;
                if (!recurrence) return false;
                
                // Check if this date is excluded
                const isExcluded = recurrence.excludedDates && recurrence.excludedDates.some(excludedDate => {
                    if (!excludedDate) return false;
                    return new Date(excludedDate).toISOString().slice(0, 10) === currentDay.toISOString().slice(0, 10);
                });
                
                if (isExcluded) return false;
                
                // Check if this day of week is included in the pattern
                const isDayIncluded = recurrence.daysOfWeek && Array.isArray(recurrence.daysOfWeek) && 
                                   recurrence.daysOfWeek.includes(dayName);
                
                if (!isDayIncluded) return false;
                
                // Check if this date is within the recurrence pattern's date range
                const patternStartDate = new Date(recurrence.startDate);
                
                // If the current day is earlier than pattern start date, skip
                if (currentDay < patternStartDate) return false;
                
                // If pattern has an end date and current day is after that, skip
                if (recurrence.endDate && recurrence.endDate !== '') {
                    const endDate = new Date(recurrence.endDate);
                    if (currentDay > endDate) return false;
                }
                
                // For weekly recurrence, check if this week matches the interval
                if (recurrence.type === "weekly") {
                    // Get the day of week of the pattern start date (0-6)
                    const startDayOfWeek = patternStartDate.getUTCDay();
                    
                    // Calculate the start of the week containing the pattern start date
                    const patternStartWeekStart = new Date(Date.UTC(
                        patternStartDate.getUTCFullYear(),
                        patternStartDate.getUTCMonth(),
                        patternStartDate.getUTCDate() - startDayOfWeek
                    ));
                    patternStartWeekStart.setUTCHours(0, 0, 0, 0);
                    
                    // Calculate the start of the week containing the current day
                    const currentDayWeekStart = new Date(Date.UTC(
                        currentDay.getUTCFullYear(),
                        currentDay.getUTCMonth(),
                        currentDay.getUTCDate() - currentDay.getUTCDay()
                    ));
                    currentDayWeekStart.setUTCHours(0, 0, 0, 0);
                    
                    // Calculate complete weeks between the start week and the current week
                    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
                    const weeksBetween = Math.floor(
                        (currentDayWeekStart.getTime() - patternStartWeekStart.getTime()) / msPerWeek
                    );
                    
                    // Check if the number of weeks matches the interval pattern
                    const isIntervalMatch = weeksBetween % (recurrence.interval || 1) === 0;
                    if (!isIntervalMatch) return false;
                }
                
                return true;
            });
            
            // Adjust the meeting times to the current day
            const adjustedPatternMeetings = patternDayMeetings.map(meeting => {
                const originalStart = new Date(meeting.startDateTime);
                const originalEnd = new Date(meeting.endDateTime);
                
                const adjustedStart = new Date(Date.UTC(
                    currentDay.getUTCFullYear(),
                    currentDay.getUTCMonth(),
                    currentDay.getUTCDate(),
                    originalStart.getUTCHours(),
                    originalStart.getUTCMinutes(),
                    originalStart.getUTCSeconds()
                ));
                
                const adjustedEnd = new Date(Date.UTC(
                    currentDay.getUTCFullYear(),
                    currentDay.getUTCMonth(),
                    currentDay.getUTCDate(),
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
            
            // Add adjusted meetings to the result
            allWeekMeetings = [...allWeekMeetings, ...adjustedPatternMeetings];
        }
        
        // Convert to the required type
        const typedMeetings: IMeeting[] = allWeekMeetings.map((meeting) => {
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

export { retrieveWeekMeetings as GET };