import React, { useState, useMemo } from 'react';
import { Task, User, Status } from '../types';

interface CalendarViewProps {
  tasks: Task[];
  users: User[];
  onDateSelect?: (date: string) => void;
}

const MONTH_NAMES = [
    "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", 
    "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"
];

const DAY_NAMES_FULL = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];
const DAY_NAMES_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];


const DAY_HEADER_COLORS = [
    'bg-blue-100 text-blue-800', // Sunday
    'bg-blue-100 text-blue-800', // Monday
    'bg-purple-100 text-purple-800', // Tuesday
    'bg-purple-100 text-purple-800', // Wednesday
    'bg-purple-100 text-purple-800', // Thursday
    'bg-purple-100 text-purple-800', // Friday
    'bg-purple-100 text-purple-800', // Saturday
];

const CalendarView: React.FC<CalendarViewProps> = ({ tasks, users, onDateSelect }) => {
  const [selectedDate, setSelectedDate] = useState(new Date());

  const selectedYear = selectedDate.getFullYear();
  const selectedMonth = selectedDate.getMonth();

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDate(new Date(selectedYear, parseInt(e.target.value), 1));
  };

  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newYear = parseInt(e.target.value);
    if (!isNaN(newYear) && String(newYear).length === 4) {
      setSelectedDate(new Date(newYear, selectedMonth, 1));
    }
  };

  const { days, tasksByDate } = useMemo(() => {
    const startOfMonth = new Date(selectedYear, selectedMonth, 1);
    const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0);
    const startDate = new Date(startOfMonth);
    startDate.setDate(startDate.getDate() - startDate.getDay());
    const endDate = new Date(endOfMonth);
    if (endDate.getDay() !== 6) {
        endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    }

    const daysArray = [];
    let day = new Date(startDate);
    while (day <= endDate) {
      daysArray.push(new Date(day));
      day.setDate(day.getDate() + 1);
    }
    
    const tasksForMonth = tasks.filter(task => {
        // Correctly parse date string to avoid timezone issues.
        // Compare year and month parts directly.
        const taskYear = parseInt(task.deadline.substring(0, 4), 10);
        const taskMonth = parseInt(task.deadline.substring(5, 7), 10); // 1-based month
        
        // selectedMonth is 0-based, so add 1 for comparison.
        return taskYear === selectedYear && taskMonth === (selectedMonth + 1) && task.status !== Status.Completed;
    });

    const tasksByDateMap: { [key: string]: Task[] } = {};
    tasksForMonth.forEach(task => {
        const dateKey = task.deadline;
        if (!tasksByDateMap[dateKey]) {
            tasksByDateMap[dateKey] = [];
        }
        tasksByDateMap[dateKey].push(task);
    });

    return { days: daysArray, tasksByDate: tasksByDateMap };
  }, [selectedYear, selectedMonth, tasks]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h2 className="text-3xl font-bold text-gray-700 tracking-wider">LỊCH CÔNG VIỆC</h2>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 w-full sm:w-auto">
            <select 
                value={selectedMonth} 
                onChange={handleMonthChange}
                className="text-xl font-semibold border-2 border-blue-400 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-blue-300 w-full sm:w-auto"
            >
                {MONTH_NAMES.map((name, index) => (
                    <option key={name} value={index}>{name}</option>
                ))}
            </select>
            <input 
                type="number" 
                value={selectedYear} 
                onChange={handleYearChange}
                className="text-xl font-semibold border-2 border-gray-300 rounded-md p-2 w-full sm:w-28 focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
        </div>
      </div>
      
      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 border border-gray-200 min-w-[768px] md:min-w-full">
            {DAY_NAMES_FULL.map((dayName, index) => (
            <div key={dayName} className={`text-center font-bold text-xs sm:text-sm py-2 ${DAY_HEADER_COLORS[index]}`}>
                <span className="hidden sm:inline">{dayName}</span>
                <span className="sm:hidden">{DAY_NAMES_SHORT[index]}</span>
            </div>
            ))}

            {days.map(d => {
            // Correctly generate date key from local date object to avoid timezone shift from toISOString().
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            
            const tasksForDay = tasksByDate[dateKey] || [];
            const isCurrentMonth = d.getMonth() === selectedMonth;
            const isClickable = isCurrentMonth && onDateSelect;

            return (
                <div 
                key={dateKey} 
                className={`bg-white h-28 sm:h-32 md:h-40 flex flex-col border-t border-l border-gray-200 
                    ${isCurrentMonth ? '' : 'bg-gray-50'} 
                    ${isClickable ? 'cursor-pointer hover:bg-blue-100 transition-colors' : ''}`
                }
                onClick={isClickable ? () => onDateSelect(dateKey) : undefined}
                >
                <div className={`w-full p-1 text-right font-bold text-white ${isCurrentMonth ? 'bg-gray-600' : 'bg-gray-400'}`}>
                    {d.getDate()}
                </div>
                <div className="flex-grow overflow-y-auto p-1 space-y-1">
                    {tasksForDay.map(task => (
                        <div key={task.id} className="p-1 rounded text-xs bg-gray-100 border-l-2 border-gray-400">
                            <p className="font-semibold truncate">{task.name}</p>
                        </div>
                    ))}
                </div>
                </div>
            );
            })}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
