import React, { useMemo } from 'react';
import { Task, User, Status } from '../types';

interface RankingProps {
    tasks: Task[];
    users: User[];
}

interface RankingData {
    userId: number;
    userName: string;
    score: number;
    completedTasks: number;
}

const Ranking: React.FC<RankingProps> = ({ tasks, users }) => {

    const rankingData = useMemo((): RankingData[] => {
        const memberUsers = users.filter(u => u.role === 'member');
        if (!memberUsers.length || !tasks.length) return [];

        const relevantTasks = tasks.filter(task =>
            task.status === Status.Completed
        );

        const userScores = memberUsers.map(user => {
            const userTasks = relevantTasks.filter(task => task.assigneeId === user.id);

            return {
                userId: user.id,
                userName: user.name,
                score: userTasks.length * 10, // Simple scoring: 10 points per completed task
                completedTasks: userTasks.length,
            };
        });

        return userScores.sort((a, b) => b.score - a.score);
    }, [tasks, users]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Bảng Xếp Hạng Thành Viên</h2>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600">Hạng</th>
                            <th className="p-3 text-left text-sm font-semibold text-gray-600">Tên Thành Viên</th>
                            <th className="p-3 text-center text-sm font-semibold text-gray-600">Điểm</th>
                            <th className="p-3 text-center text-sm font-semibold text-gray-600">Công Việc Hoàn Thành</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rankingData.length > 0 ? rankingData.map((data, index) => (
                            <tr key={data.userId} className="border-b hover:bg-gray-50">
                                <td className="p-3 font-bold text-gray-700">
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                                        index === 0 ? 'bg-yellow-400 text-white' : 
                                        index === 1 ? 'bg-gray-400 text-white' : 
                                        index === 2 ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'
                                    }`}>
                                        {index + 1}
                                    </span>
                                </td>
                                <td className="p-3 text-sm font-bold text-gray-800">{data.userName}</td>
                                <td className="p-3 text-center text-lg font-bold text-blue-600">{data.score}</td>
                                <td className="p-3 text-center text-sm text-gray-700">{data.completedTasks}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={4} className="p-6 text-center text-gray-500">
                                    Không có dữ liệu xếp hạng.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Ranking;