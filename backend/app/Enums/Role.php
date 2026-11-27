<?php

namespace App\Enums;

enum Role: string
{
    case Citizen = 'citizen';
    case Officer = 'officer';
    case Admin = 'admin';
}
