import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const deleteMeeting = async (request: Request) => {
  try {
    const body = await request.json();
    const { mid, deleteOption, currentOccurrenceDate } = body;

    console.log('Delete request received:', { mid, deleteOption, currentOccurrenceDate });

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
          console.log('Deleting only this occurrence');

          if (!currentOccurrenceDate) {
            return new Response(JSON.stringify({ error: "Current occurrence date is required for this option" }), {
              status: 400,
              headers: {'Content-Type': 'application/json'},
            });
          }
          if (meeting.recurrencePattern){
            try {
              await prisma.recurrencePattern.update({
                where: { id: meeting.recurrencePattern.id },
                data: {
                  excludedDates: {
                    push: new Date(currentOccurrenceDate)
                  }
                }
              });
            } catch (error) {
              console.error("Error updating excludedDates:", error);
              return new Response(JSON.stringify({ error: "Failed to update recurrence pattern" }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          } else {
            await prisma.meeting.delete({ where: { mid } });
          }
          break;

        case 'thisAndFollowing':
          console.log('Deleting this and following occurrences');
          if (!currentOccurrenceDate) {
            return new Response(JSON.stringify({ error: "Current occurrence date is required for this option" }), {
              status: 400,
              headers: {'Content-Type': 'application/json'},
            });
          }
          if (meeting.recurrencePattern){
            try {
                console.log("Current occurence date:", new Date(currentOccurrenceDate).toISOString().slice(0, 10));
                console.log("meeting start date:", meeting.startDateTime);

                if (new Date(currentOccurrenceDate).toISOString().slice(0, 10) === new Date(meeting.startDateTime).toISOString().slice(0, 10)) {
                  try {
                    await prisma.recurrencePattern.delete({
                      where: {id: meeting.recurrencePattern.id}
                    })
      
                    await prisma.meeting.delete({
                      where: { mid }
                    })
                  } catch (error) {
                    console.error("Error while deleting recurring meetings:", error);
                    return new Response(JSON.stringify({ error: "Error while deleting recurring meetings" }), {
                      status: 500,
                      headers: { 'Content-Type': 'application/json' },
                    });
                  }
                }
                else {  
                  await prisma.recurrencePattern.update({
                    where: { id: meeting.recurrencePattern.id },
                    data: {
                      endDate: new Date(currentOccurrenceDate),
                      excludedDates: {
                        push: new Date(currentOccurrenceDate)
                      }
                    }
                  });
                }
            } catch (error) {
              console.error("Error changing end date", error);
              return new Response(JSON.stringify({ error: "Failed to update recurrence pattern" }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
              });
            }
          } else {
            await prisma.meeting.delete({ where: { mid } });
          }
          break;

        case 'all':
          console.log('Deleting all occurrences');

          if (meeting.recurrencePattern) {
            try {
              await prisma.recurrencePattern.delete({
                where: {id: meeting.recurrencePattern.id}
              })

              await prisma.meeting.delete({
                where: { mid }
              })
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