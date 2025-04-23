import React from 'react';

interface PandaDocButtonProps {
  className?: string;
}

//Grabs meeting data from first two weeks of July and filters July 1st - July 7th
//API week filter gets Sun->Sat, so jul 1st and jul 8th weeks are grabbed to account for all cases :)
const PandaDocButton: React.FC<PandaDocButtonProps> = ({ className }) => {
  const fetchMeetings = async () => {
    try {
      const currentYear = new Date().getFullYear();
      const julyFirst = new Date(currentYear, 6, 1);
      
      const julFirstStr = julyFirst.toLocaleString("en-US", {timeZone: "America/New_York"});
      
      const firstWeekRes = await fetch(`/api/retrieve/meeting/week?startDate=${julFirstStr}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!firstWeekRes.ok) {
        throw new Error(`HTTP error! Status: ${firstWeekRes.status}`);
      }
      
      const firstWeekMeetings = await firstWeekRes.json();
      
      const julyEighth = new Date(currentYear, 6, 8);
      const julEigthStr = julyEighth.toLocaleString("en-US", {timeZone: "America/New_York"});
      
      const secondWeekRes = await fetch(`/api/retrieve/meeting/week?startDate=${julEigthStr}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!secondWeekRes.ok) {
        throw new Error(`HTTP error! Status: ${secondWeekRes.status}`);
      }
      
      const secondWeekMeetings = await secondWeekRes.json();
      
      const allMeetings = [...firstWeekMeetings, ...secondWeekMeetings];
      
      const julyFirst00 = new Date(currentYear, 6, 1, 0, 0, 0, 0);
      const julySeventhEnd = new Date(currentYear, 6, 7, 23, 59, 59, 999);
      
      const filteredMeetings = allMeetings.filter(meeting => {
        const meetingDate = new Date(meeting.startDateTime);
        return meetingDate >= julyFirst00 && meetingDate <= julySeventhEnd;
      });
      
      return filteredMeetings;
    } catch (error) {
      console.error('Error fetching meetings:', error);
      return [];
    }
  };

  
  const determinePremiseType = (room: string, zoomAccount: string) => {
    if (room === "Zoom Only" || room === "") {
      return "Zoom Only";
    } else if (zoomAccount && zoomAccount !== "") {
      return "Hybrid";
    } else {
      return "In-Person Only";
    }
  };

  const getRoomRate = (room: string) => {
    const roomRates: {[key: string]: number} = {
      "Serenity Room": 15,
      "Seeds of Hope": 10,
      "Unity Room": 10,
      "Room for Improvement": 10,
      "Small but Powerful - Left": 10,
      "Small but Powerful - Right": 10,
      "Zoom Only": 10 
    };
    
    return roomRates[room] || 10;
  };

  const calculateRentCharge = (premiseType: string, billableTime: number, roomRate: number) => {
    if (premiseType === "Zoom Only") {
      return 10;
    } else {
      return 4 * billableTime * roomRate; 
    }
  };

  const formatRoomDisplay = (room: string) => {
    switch (room) {
      case "Serenity Room":
        return "Serenity Room ($15/hr) - Main Floor";
      case "Seeds of Hope":
        return "Seeds of Hope ($10/hr) - Upstairs";
      case "Unity Room":
        return "Unity Room ($10/hr) - Basement";
      case "Room for Improvement":
        return "Room for Improvement ($10/hr)";
      case "Small but Powerful - Left":
        return "Small but Powerful - Left ($10/hr)";
      case "Small but Powerful - Right":
        return "Small but Powerful - Right ($10/hr)";
      case "Zoom Only":
        return "Zoom Only ($10/month)";
      default:
        return room;
    }
  };

  const formatDayOfWeek = (date: Date) => {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return days[date.getDay()];
  };

  const formatTime = (date: Date) => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    
    hours = hours % 12;
    hours = hours ? hours : 12; 
    
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    
    return `${hours}:${minutesStr} ${ampm}`;
  };

  const calculateBillableTime = (startDate: Date, endDate: Date) => {
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    return diffHours;
  };

  const convertMeetingsToCSV = (meetings: any[]) => {
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;
    const fileYearRange = `${currentYear} - ${nextYear}`;
    
    const csvRows = meetings.map(meeting => {
      const startDateTime = new Date(meeting.startDateTime);
      const endDateTime = new Date(meeting.endDateTime);
      
      const billableTime = calculateBillableTime(startDateTime, endDateTime);
      
      const premiseType = determinePremiseType(meeting.room, meeting.zoomAccount);
      
      const roomRate = getRoomRate(meeting.room);
      
      const rentCharge = calculateRentCharge(premiseType, billableTime, roomRate);
      
      const emailMessage = `Hello ${meeting.title}
        Please find the link below to your ${fileYearRange} lease. If you have any questions, please contact Rentals@518ICR.com with any questions.
        If you have a rent reduction, this will need to be renewed. Please email Rentals@518ICR.com to request an extension.
        Thank You
        Ithaca Community Recovery`;
      
      return {
        DocumentTitle: `${fileYearRange} Lease - ${meeting.title}`,
        "Client.City": "Ithaca",
        "Client.Company": meeting.title,
        "Client.Country": "US",
        "Client.Email": "placeholder@email.com",
        "Client.PostalCode": "14850",
        "Client.State": "NY",
        "Client.StreetAddress": "518 W Seneca St",
        "Rental Agent.City": "Ithaca",
        "Rental Agent.Company": "Ithaca Community Recovery",
        "Rental Agent.Country": "US",
        "Rental Agent.Email": "Rentals@518ICR.com",
        "Rental Agent.FirstName": "Rental",
        "Rental Agent.LastName": "Agent",
        "Rental Agent.Phone": "(607) 216-8754",
        "Rental Agent.PostalCode": "14850",
        "Rental Agent.State": "NY",
        "Rental Agent.StreetAddress": "518 W Seneca St",
        "Rental Agent.Title": "Rental Agent",
        "Billable Time": billableTime.toString(),
        "Business Meeting": "",
        "Group Name": meeting.title,
        "Lease End Date": `30-Jun-${(nextYear).toString().slice(-2)}`,
        "Lease Start Date": `1-Jul-${currentYear.toString().slice(-2)}`,
        "Meeting Day": formatDayOfWeek(startDateTime),
        "Meeting Type": meeting.type || "",
        "Premise and Use": premiseType,
        "Rent Charge": `$${rentCharge.toFixed(2)}`,
        "Room": formatRoomDisplay(meeting.room),
        "Start Time": formatTime(startDateTime),
        "End Time": formatTime(endDateTime),
        "EmailMessage": emailMessage
      };
    });
    
    return csvRows;
  };

  const convertToCSV = (objArray: any[]) => {
    if (objArray.length === 0) return '';
    
    const array = [Object.keys(objArray[0])].concat(objArray);
    
    return array.map(row => {
      return Object.values(row)
        .map(value => {
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(',');
    }).join('\n');
  };
  
  const downloadCSV = (csvContent: string, fileName: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportCSV = async () => {
    try {
      console.log("Fetching meetings for CSV export...");
      
      const meetings = await fetchMeetings();
      
      if (meetings.length === 0) {
        alert("No meetings found for the first week of July.");
        return;
      }
      
      const csvData = convertMeetingsToCSV(meetings);
      
      const csvString = convertToCSV(csvData);
      
      const currentYear = new Date().getFullYear();
      const nextYear = currentYear + 1;
      const fileName = `${currentYear} - ${nextYear} Bulks Send Lease.csv`;
      
      downloadCSV(csvString, fileName);
      
      console.log("CSV export completed successfully!");
      
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert("Error exporting CSV. Please try again.");
    }
  };

  return (
    <div className={className} onClick={handleExportCSV}>
      Export CSV
    </div>
  );
};

export default PandaDocButton;