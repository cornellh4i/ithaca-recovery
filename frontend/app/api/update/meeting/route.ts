import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { IMeeting } from "../../../../util/models";
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const updateMeeting = async (request: Request): Promise<Response> => {
  try {
    const body = await request.json();
    const { meeting, recurringOption, currentOccurrenceDate } = body;

    // If no meeting data is provided, return an error
    if (!meeting) {
      return NextResponse.json({ error: "No meeting data provided" }, { status: 400 });
    }

    const { mid, ...dataWithoutMid } = meeting;

    // Find the existing meeting
    const existingMeeting = await prisma.meeting.findUnique({
      where: { mid },
      include: { recurrencePattern: true }
    });

    if (!existingMeeting) {
      console.error('Meeting not found:', mid);
      return NextResponse.json({ error: `Meeting with ID ${mid} not found` }, { status: 404 });
    }

    const isRecurring = !!existingMeeting.recurrencePattern || existingMeeting.isRecurring;

    // Fix for the recurrence pattern data
    let recurrencePatternData = null;
    if (dataWithoutMid.recurrencePattern) {
      // Create a copy of the recurrence pattern without 'id' and fix numberOfOccurrences -> numberOfOccurences
      const { id, numberOfOccurrences, ...patternWithoutId } = dataWithoutMid.recurrencePattern;
      recurrencePatternData = {
        ...patternWithoutId,
        // Fix the typo in the field name
        numberOfOccurences: numberOfOccurrences
      };
    }

    if (isRecurring) {
      if (!recurringOption) {
        return NextResponse.json({ error: "Update option is required for recurring meetings" }, { status: 400 });
      }

      console.log('Handling recurring meeting update with option:', recurringOption);

      switch (recurringOption) {
        case 'this':
          console.log('Updating only this occurrence');

          if (!currentOccurrenceDate) {
            return NextResponse.json({ error: "Current occurrence date is required for this option" }, { status: 400 });
          }

          if (existingMeeting.recurrencePattern) {
            try {
              // If updating only this instance, we need to add it to the excludedDates
              // and create a new non-recurring instance with the updated properties
              await prisma.recurrencePattern.update({
                where: { id: existingMeeting.recurrencePattern.id },
                data: {
                  excludedDates: {
                    push: new Date(currentOccurrenceDate)
                  }
                }
              });

              // Generate a new UUID for the mid field
              const newMid = uuidv4();

              // Create a new meeting instance for this occurrence
              const newOccurrence = await prisma.meeting.create({
                data: {
                  ...dataWithoutMid,
                  mid: newMid,
                  isRecurring: false, // This is now a one-time meeting
                  recurrencePattern: undefined, // Remove the recurrence pattern reference
                }
              });

              return NextResponse.json(newOccurrence);
            } catch (error) {
              console.error("Error updating single occurrence:", error);
              return NextResponse.json({ error: "Failed to update recurrence pattern" }, { status: 500 });
            }
          } else {
            // If it's marked as recurring but has no pattern, just update it directly
            const updatedMeeting = await prisma.meeting.update({
              where: { mid },
              data: dataWithoutMid
            });
            return NextResponse.json(updatedMeeting);
          }
          break;

        case 'thisAndFollowing':
          console.log('Updating this and following occurrences');
          
          if (!currentOccurrenceDate) {
            return NextResponse.json({ error: "Current occurrence date is required for this option" }, { status: 400 });
          }
          
          if (existingMeeting.recurrencePattern) {
            try {
              const currentDate = new Date(currentOccurrenceDate);
              const startDate = new Date(existingMeeting.startDateTime);
              
              // If we're modifying the first occurrence, update the main meeting
              if (currentDate.toISOString().split('T')[0] === startDate.toISOString().split('T')[0]) {
                // Update the recurring meeting and its pattern
                const updatedMeeting = await prisma.meeting.update({
                  where: { mid },
                  data: {
                    ...dataWithoutMid,
                    recurrencePattern: recurrencePatternData ? {
                      update: recurrencePatternData
                    } : undefined
                  },
                  include: { recurrencePattern: true }
                });
                return NextResponse.json(updatedMeeting);
              } else {
                // End the original series at the day before this occurrence
                const dayBeforeCurrent = new Date(currentDate);
                dayBeforeCurrent.setDate(currentDate.getDate() - 1);
                
                await prisma.recurrencePattern.update({
                  where: { id: existingMeeting.recurrencePattern.id },
                  data: {
                    endDate: dayBeforeCurrent
                  }
                });
                
                // Create a new meeting with times adjusted to the occurrence date
                const startTime = new Date(existingMeeting.startDateTime);
                const endTime = new Date(existingMeeting.endDateTime);
                
                // Calculate time difference in hours and minutes to preserve meeting duration
                const hoursDiff = startTime.getUTCHours();
                const minutesDiff = startTime.getUTCMinutes();
                
                // Create new start and end times for the new meeting
                const newStartDateTime = new Date(currentDate);
                newStartDateTime.setUTCHours(hoursDiff, minutesDiff, 0, 0);
                
                // Calculate meeting duration in milliseconds
                const meetingDuration = endTime.getTime() - startTime.getTime();
                const newEndDateTime = new Date(newStartDateTime.getTime() + meetingDuration);
                
                // Generate a new UUID for the mid field
                const newMid = uuidv4();
                
                // Create a new recurring meeting starting from this occurrence
                const newRecurringMeeting = await prisma.meeting.create({
                  data: {
                    ...dataWithoutMid,
                    mid: newMid,
                    startDateTime: newStartDateTime,
                    endDateTime: newEndDateTime,
                    isRecurring: true,
                    recurrencePattern: recurrencePatternData ? {
                      create: {
                        ...recurrencePatternData,
                        startDate: currentDate
                      }
                    } : undefined
                  },
                  include: { recurrencePattern: true }
                });
                
                return NextResponse.json(newRecurringMeeting);
              }
            } catch (error) {
              console.error("Error updating this and following occurrences:", error);
              return NextResponse.json({ 
                error: "Failed to update recurrence pattern: " + (error instanceof Error ? error.message : String(error))
              }, { status: 500 });
            }
          } else {
            // If it's marked as recurring but has no pattern, just update it directly
            const updatedMeeting = await prisma.meeting.update({
              where: { mid },
              data: dataWithoutMid
            });
            return NextResponse.json(updatedMeeting);
          }
          break;

        case 'all':
          console.log('Updating all occurrences');
          
          // Simply update the recurring meeting
          const updatedMeeting = await prisma.meeting.update({
            where: { mid },
            data: {
              ...dataWithoutMid,
              recurrencePattern: existingMeeting.recurrencePattern ? {
                update: recurrencePatternData
              } : undefined
            },
            include: { recurrencePattern: true }
          });
          
          return NextResponse.json(updatedMeeting);
          break;

        default:
          return NextResponse.json({ error: "Invalid update option" }, { status: 400 });
      }
    } else {
      // For non-recurring meetings, just update directly
      console.log('Updating non-recurring meeting');
      const updatedMeeting = await prisma.meeting.update({
        where: { mid },
        data: dataWithoutMid
      });
      
      return NextResponse.json(updatedMeeting);
    }
  } catch (error) {
    console.error('Detailed error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error occurred",
      details: error
    }, { status: 500 });
  }
};

export { updateMeeting as PUT };