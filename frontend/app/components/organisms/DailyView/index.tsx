import React from "react";
import BoxText from '../../atoms/BoxText/index';

const DailyView = () => {
    return (
        <div className="room-blocks">
            <BoxText boxType="Room Block" title="Serenity Room" primaryColor="#b3ea75" />
            <BoxText boxType="Room Block" title="Seeds of Hope" primaryColor="#f7e57b" />
            <BoxText boxType="Room Block" title="Unity Room" primaryColor="#96dbfe" />
            <BoxText boxType="Room Block" title="Room for Improvement" primaryColor="#ffae73" />
            <BoxText boxType="Room Block" title="Small but Powerful - Right" primaryColor="#d2afff" />
            <BoxText boxType="Room Block" title="Small but Powerful - Left" primaryColor="#ffa3c2" />
            <BoxText boxType="Room Block" title="Zoom Email 1" primaryColor="#cecece" />
            <BoxText boxType="Room Block" title="Zoom Email 2" primaryColor="#cecece" />
            <BoxText boxType="Room Block" title="Zoom Email 3" primaryColor="#cecece" />
            <BoxText boxType="Room Block" title="Zoom Email 4" primaryColor="#cecece" />
        </div>
    )
};

export default DailyView;