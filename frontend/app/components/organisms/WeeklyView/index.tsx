interface WeeklyViewProps {
    view: string;
}

const WeeklyView: React.FC<WeeklyViewProps> = ({view}) => {
    return (
        <div className="weekly-view">
        <h2>Weekly View</h2>

        <p>Selected View: {view}</p>
        {/* Add your weekly view content here */}
        </div>
    );
};

export default WeeklyView