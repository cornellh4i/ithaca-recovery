import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const deleteMeeting = async (request: Request) => {
  try {
    const body = await request.json();
    const { mid, deleteOption } = body;

    console.log('Delete request received:', { mid, deleteOption });

    const meeting = await prisma.meeting.findUnique({
      where: { mid },
      include: { recurrencePattern: true }
    });

    if (!meeting) {
      console.error('Meeting not found:', mid);
      return new Response(JSON.stringify({ error: "Meeting not found" }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const isRecurring = !!meeting.recurrencePattern || meeting.isRecurring;

    if (isRecurring) {
      if (!deleteOption) {
        return new Response(JSON.stringify({ error: "Delete option is required for recurring meetings" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      console.log('Handling recurring meeting deletion with option:', deleteOption);

      switch (deleteOption) {
        case 'this':
          console.log('Deleting only this occurrence - PLACEHOLDER');
          break;

        case 'thisAndFollowing':
          console.log('Deleting this and following occurrences - PLACEHOLDER');
          break;

        case 'all':
          console.log('Deleting all occurrences');

          if (meeting.recurrencePattern) {
            try {
              const allMeetings = await prisma.meeting.findMany({
                where: {
                  recurrencePattern: {
                    id: meeting.recurrencePattern.id
                  }
                }
              });

              console.log(`Found ${allMeetings.length} meetings to delete`);

              for (const mtg of allMeetings) {
                await prisma.meeting.update({
                  where: { id: mtg.id },
                  data: {
                    recurrencePattern: {
                      disconnect: true
                    }
                  }
                });

                await prisma.meeting.delete({
                  where: { id: mtg.id }
                });
              }

              console.log("Deleting recurrence pattern:", meeting.recurrencePattern.id);
              await prisma.recurrencePattern.delete({
                where: {
                  id: meeting.recurrencePattern.id
                }
              });

              // Ensure the original meeting is deleted (if not already in list)
              const isAlreadyDeleted = allMeetings.some(m => m.id === meeting.id);
              if (!isAlreadyDeleted) {
                await prisma.meeting.delete({ where: { mid } });
              }

            } catch (error) {
              console.error("Error while deleting recurring meetings:", error);
              return new Response(JSON.stringify({ error: "Error while deleting recurring meetings" }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          } else {
            await prisma.meeting.delete({ where: { mid } });
          }
          break;

        default:
          return new Response(JSON.stringify({ error: "Invalid delete option" }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
      }
    } else {
      console.log('Deleting non-recurring meeting');
      await prisma.meeting.delete({ where: { mid } });
    }

    return new Response(JSON.stringify({ message: "Meeting deleted successfully" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("Error deleting meeting: ", error);
    return new Response(JSON.stringify({ error: "Failed to delete meeting" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export { deleteMeeting as DELETE };